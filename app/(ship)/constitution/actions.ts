"use server";

// Saving health data, through the person's own client: row-level security
// only lets an Owner write their own rows.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MEASURES, STARTER_HABITS } from "@/lib/constitution";
import { currentHealthOwner } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";

type Result = string | null;

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const done = () => revalidatePath("/constitution", "layout");

/** A number from the form: null when blank, undefined when it isn't a sensible one. */
function measure(form: FormData, key: string, max: number, whole: boolean): number | null | undefined {
  const raw = text(form, key).replace(",", ".");
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > max || (whole && !Number.isInteger(n))) return undefined;
  return n;
}

/** First visit: where you're starting from, and some habits to begin with. */
export async function startTracking(_: Result, form: FormData): Promise<Result> {
  const member = await currentHealthOwner();
  const date = text(form, "baseline_date");
  const weight = measure(form, "baseline_weight_kg", 400, false);
  const waist = measure(form, "baseline_waist_cm", 300, false);
  if (!isDay(date)) return "Pick the date you started.";
  if (weight === undefined || waist === undefined) return "Weight is in kg and waist in cm, like 98.7 and 110.5.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("health_profiles")
    .insert({ profile_id: member.id, baseline_date: date, baseline_weight_kg: weight, baseline_waist_cm: waist });
  if (error) {
    console.error(error);
    return "Couldn't save that. Try again.";
  }
  await supabase.from("health_habits").insert(STARTER_HABITS.map((h, position) => ({ ...h, position, profile_id: member.id })));
  done();
  redirect("/constitution");
}

export async function saveEntry(entryId: string | null, _: Result, form: FormData): Promise<Result> {
  const member = await currentHealthOwner();
  const date = text(form, "entry_date");
  if (!isDay(date)) return "Pick the date for this entry.";
  const values: Record<string, number | null> = {};
  for (const m of MEASURES) {
    const v = measure(form, m.key, m.max, m.step === 1);
    if (v === undefined) return `${m.label} doesn't look right.`;
    values[m.key] = v;
  }
  const row = { ...values, entry_date: date, notes: text(form, "notes") || null };
  const supabase = await createClient();
  const { error } = entryId
    ? await supabase.from("health_entries").update(row).eq("id", entryId).select("id").single()
    : await supabase.from("health_entries").insert({ ...row, profile_id: member.id });
  if (error) {
    if (error.code === "23505") return "There's already an entry for that date. Change that one instead.";
    console.error(error);
    return "Couldn't save that. Try again.";
  }
  done();
  // A new week gets its check-in straight away.
  redirect(entryId ? "/constitution" : "/constitution?checkin=1");
}

export async function deleteEntry(entryId: string): Promise<Result> {
  await currentHealthOwner();
  const supabase = await createClient();
  const { error } = await supabase.from("health_entries").delete().eq("id", entryId).select("id").single();
  if (error) return "Couldn't delete it. Try again.";
  done();
  redirect("/constitution");
}

/** Baseline, habits (one per line, "name: target") and the check-in instructions. */
export async function saveSettings(_: Result, form: FormData): Promise<Result> {
  const member = await currentHealthOwner();
  const date = text(form, "baseline_date");
  const weight = measure(form, "baseline_weight_kg", 400, false);
  const waist = measure(form, "baseline_waist_cm", 300, false);
  if (!isDay(date)) return "Pick the date you started.";
  if (weight === undefined || waist === undefined) return "Weight is in kg and waist in cm, like 98.7 and 110.5.";
  const habits = text(form, "habits")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, position) => {
      const [name, ...target] = line.split(":");
      return { name: name.trim().slice(0, 80), target: target.join(":").trim().slice(0, 200) || null, position, profile_id: member.id };
    })
    .filter((h) => h.name);
  const supabase = await createClient();
  const { error } = await supabase
    .from("health_profiles")
    .update({ baseline_date: date, baseline_weight_kg: weight, baseline_waist_cm: waist, checkin_prompt: text(form, "checkin_prompt") || null })
    .eq("profile_id", member.id)
    .select("profile_id")
    .single();
  if (error) return "Couldn't save that. Try again.";
  // ponytail: habits are replaced wholesale; nothing else points at them.
  await supabase.from("health_habits").delete().eq("profile_id", member.id);
  if (habits.length) await supabase.from("health_habits").insert(habits);
  done();
  redirect("/constitution");
}

export async function deleteCheckin(checkinId: string): Promise<Result> {
  await currentHealthOwner();
  const supabase = await createClient();
  const { error } = await supabase.from("health_checkins").delete().eq("id", checkinId).select("id").single();
  if (error) return "Couldn't delete it. Try again.";
  done();
  return null;
}
