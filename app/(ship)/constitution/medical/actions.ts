"use server";

// Saving medical records, through the signed-in user's own client: row-level
// security only lets Captains write them, about people in their household.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fromWall } from "@/lib/logbook";
import { type Field, type Kind, KINDS, type PersonKey, isPersonKey, medicareExpiry, medicareProblem, personColumns } from "@/lib/medical";
import { currentHealthOwner } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";
import { FILE_BUCKET } from "./data";

type Result = string | null;

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const done = () => {
  revalidatePath("/constitution", "layout");
  revalidatePath("/crew");
};
const back = (person: PersonKey) => redirect(`/constitution/medical?person=${encodeURIComponent(person)}`);
const SAVE_FAILED = "Couldn't save that. Try again.";

function failed(error: { code?: string; message?: string }): string {
  if (error.code === "42501") return "Only a Captain can change medical records, for people in the household.";
  console.error(error);
  return SAVE_FAILED;
}

/** The emergency card: allergies, conditions, medications, Medicare, health fund and GP. */
export async function saveCard(person: PersonKey, _: Result, form: FormData): Promise<Result> {
  const member = await currentHealthOwner();
  if (!isPersonKey(person)) return "Pick who this is for.";
  const number = text(form, "medicare_number").replace(/\s+/g, "");
  const irn = text(form, "medicare_irn");
  const expiryRaw = text(form, "medicare_expiry");
  const expiry = expiryRaw ? medicareExpiry(expiryRaw) : null;
  if (number) {
    const problem = medicareProblem(number);
    if (problem) return problem;
  }
  if (irn && !/^[1-9]$/.test(irn)) return "The number beside the name on the card is a single digit, 1 to 9.";
  if (expiryRaw && !expiry) return "Write the expiry as it's on the card, like 08/2029.";
  const card = {
    ...personColumns(person),
    household_id: member.householdId,
    blood_type: text(form, "blood_type") || null,
    allergies: text(form, "allergies") || null,
    conditions: text(form, "conditions") || null,
    medications: text(form, "medications") || null,
    medicare_number: number || null,
    medicare_irn: irn || null,
    medicare_expiry: expiry,
    health_fund: text(form, "health_fund") || null,
    health_fund_number: text(form, "health_fund_number") || null,
    gp_name: text(form, "gp_name") || null,
    gp_clinic: text(form, "gp_clinic") || null,
    gp_phone: text(form, "gp_phone") || null,
    notes: text(form, "notes") || null,
  };
  const supabase = await createClient();
  const col = card.profile_id ? "profile_id" : "dependent_id";
  const { data: existing } = await supabase.from("medical_profiles").select("id").eq(col, card.profile_id ?? card.dependent_id!).maybeSingle();
  const { error } = existing
    ? await supabase.from("medical_profiles").update(card).eq("id", existing.id).select("id").single()
    : await supabase.from("medical_profiles").insert(card);
  if (error) return failed(error);
  done();
  back(person);
  return null;
}

/** "2026-11-03T09:00", typed in Sydney time, as an instant. */
const wallTime = (s: string) => {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  return m ? fromWall({ y: +m[1], m: +m[2], d: +m[3], h: +m[4], min: +m[5] }) : null;
};

export async function saveRecord(kind: Kind, recordId: string | null, person: PersonKey, _: Result, form: FormData): Promise<Result> {
  const member = await currentHealthOwner();
  if (!isPersonKey(person) || !(kind in KINDS)) return "Pick who this is for.";
  const values: Record<string, string | number | null> = {};
  for (const f of KINDS[kind].fields as readonly Field[]) {
    const raw = text(form, f.name);
    if (f.required && !raw) return `Fill in “${f.label}”.`;
    if (f.type === "date" && raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `“${f.label}” needs a date.`;
    if (f.type === "minutes") {
      const n = raw ? Number(raw) : 30;
      if (!Number.isInteger(n) || n < 5 || n > 720) return "How long is in minutes, between 5 and 720.";
      values[f.name] = n;
    } else values[f.name] = raw || null;
  }
  const supabase = await createClient();
  const who = personColumns(person);

  if (kind === "appointment") {
    const starts = wallTime(String(values.starts_at));
    if (!starts) return "Pick a date and time.";
    // The Logbook event moves with it, in the same transaction.
    const { error } = await supabase.rpc("medical_save_appointment", {
      p_appointment: recordId,
      p_household: member.householdId,
      p_profile: who.profile_id,
      p_dependent: who.dependent_id,
      p_starts: starts.toISOString(),
      p_minutes: values.minutes,
      p_provider: values.provider,
      p_reason: values.reason,
      p_outcome: values.outcome,
      p_follow_up: values.follow_up,
    });
    if (error) return error.code === "P0030" ? "That appointment has gone." : failed(error);
    revalidatePath("/logbook", "layout");
  } else {
    const row = { ...values, ...who, household_id: member.householdId };
    const { error } = recordId
      ? await supabase.from(KINDS[kind].table).update(row).eq("id", recordId).select("id").single()
      : await supabase.from(KINDS[kind].table).insert({ ...row, created_by: member.id });
    if (error) return failed(error);
  }
  done();
  back(person);
  return null;
}

export async function deleteRecord(kind: Kind, recordId: string, person: PersonKey): Promise<Result> {
  await currentHealthOwner();
  const supabase = await createClient();
  const { error } = await supabase.from(KINDS[kind].table).delete().eq("id", recordId).select("id").single();
  if (error) return "Couldn't delete it. Try again.";
  if (kind === "appointment") revalidatePath("/logbook", "layout");
  done();
  back(person);
  return null;
}

/** Records a document the browser has just uploaded to the household's folder. */
export async function addFile(
  person: PersonKey,
  file: { path: string; name: string; size: number; appointmentId: string | null; resultId: string | null },
): Promise<Result> {
  const member = await currentHealthOwner();
  if (!isPersonKey(person) || !file.path.startsWith(`${member.householdId}/`)) return "That upload went somewhere unexpected.";
  const supabase = await createClient();
  const { error } = await supabase.from("medical_files").insert({
    ...personColumns(person),
    household_id: member.householdId,
    path: file.path,
    name: file.name.slice(0, 200),
    size_bytes: file.size,
    appointment_id: file.appointmentId,
    result_id: file.resultId,
    created_by: member.id,
  });
  if (error) return failed(error);
  done();
  return null;
}

export async function deleteFile(fileId: string): Promise<Result> {
  await currentHealthOwner();
  const supabase = await createClient();
  const { data, error } = await supabase.from("medical_files").delete().eq("id", fileId).select("path").single();
  if (error) return "Couldn't delete it. Try again.";
  await supabase.storage.from(FILE_BUCKET).remove([data.path]);
  done();
  return null;
}
