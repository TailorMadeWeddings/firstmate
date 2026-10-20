"use server";

// Adding, changing, ticking off and deleting duties, through the signed-in
// user's own client: row-level security lets the crew do all of it, and only
// Captains or whoever added a duty delete it.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { REPEATS, type Repeat, nextDue } from "@/lib/duties";
import { dayKey } from "@/lib/logbook";
import { currentCrew } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";

type Result = string | null;

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const done = () => revalidatePath("/duties", "layout");

/** The duty a form describes, or what's wrong with it. */
function dutyFrom(form: FormData) {
  const title = text(form, "title");
  const due = text(form, "due_on");
  const repeat = text(form, "repeat");
  const category = text(form, "category");
  const who = text(form, "who");
  if (!title) return "Say what needs doing.";
  if (title.length > 200) return "Keep it under 200 characters; put the rest in the notes.";
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return "Pick a due date.";
  if (repeat && !(repeat in REPEATS)) return "Pick how often it repeats.";
  if (repeat && !due) return "A repeating duty needs a due date to start from.";
  if (category.length > 40) return "Keep the category short.";
  return {
    title,
    notes: text(form, "notes") || null,
    category: category || null,
    due_on: due || null,
    repeat: (repeat || null) as Repeat | null,
    important: form.get("important") === "on",
    assigned_profile: who.startsWith("p:") ? who.slice(2) : null,
    assigned_dependent: who.startsWith("d:") ? who.slice(2) : null,
  };
}

function problem(error: { code?: string }): string {
  if (error.code === "42501") return "Pick someone from your own household.";
  console.error(error);
  return "Couldn't save that. Try again.";
}

export async function addDuty(_: Result, form: FormData): Promise<Result> {
  const member = await currentCrew();
  const duty = dutyFrom(form);
  if (typeof duty === "string") return duty;
  const supabase = await createClient();
  const { error } = await supabase.from("duties").insert({ ...duty, household_id: member.householdId, created_by: member.id });
  if (error) return problem(error);
  done();
  return null;
}

export async function saveDuty(id: string, _: Result, form: FormData): Promise<Result> {
  await currentCrew();
  const duty = dutyFrom(form);
  if (typeof duty === "string") return duty;
  const supabase = await createClient();
  const { error } = await supabase.from("duties").update(duty).eq("id", id).select("id").single();
  if (error) return problem(error);
  done();
  redirect("/duties");
}

/** Ticks a duty off (or back on). A repeating one moves to its next date instead. */
export async function setDone(id: string, isDone: boolean): Promise<Result> {
  const member = await currentCrew();
  const supabase = await createClient();
  let change: Record<string, unknown> = isDone ? { done_at: new Date().toISOString(), done_by: member.id } : { done_at: null, done_by: null };
  if (isDone) {
    const { data } = await supabase.from("duties").select("due_on, repeat").eq("id", id).maybeSingle();
    if (data?.repeat && data.due_on) change = { due_on: nextDue(data.due_on, data.repeat as Repeat, dayKey(new Date())) };
  }
  const { error } = await supabase.from("duties").update(change).eq("id", id).select("id").single();
  if (error) return problem(error);
  done();
  revalidatePath("/");
  return null;
}

export async function deleteDuty(id: string): Promise<Result> {
  await currentCrew();
  const supabase = await createClient();
  const { error } = await supabase.from("duties").delete().eq("id", id).select("id").single();
  if (error) return error.code === "PGRST116" ? "Only a Captain, or whoever added it, can delete this." : "Couldn't delete it. Try again.";
  done();
  redirect("/duties");
}
