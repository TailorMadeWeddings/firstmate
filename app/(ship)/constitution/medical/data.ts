// Loading medical records. Reads go through the signed-in user's client, so
// row-level security decides: Captains see everyone's, Officers only the
// children's emergency cards.
import { type Kind, KINDS, type PersonKey, personColumns } from "@/lib/medical";
import { createClient } from "@/lib/supabase/server";
import { loadCrew } from "../../logbook/data";

export const FILE_BUCKET = "medical-files";

export type Card = {
  id: string;
  blood_type: string | null;
  allergies: string | null;
  conditions: string | null;
  medications: string | null;
  medicare_number: string | null;
  medicare_irn: string | null;
  medicare_expiry: string | null;
  health_fund: string | null;
  health_fund_number: string | null;
  gp_name: string | null;
  gp_clinic: string | null;
  gp_phone: string | null;
  notes: string | null;
};
const CARD = "id, profile_id, dependent_id, blood_type, allergies, conditions, medications, medicare_number, medicare_irn, medicare_expiry, health_fund, health_fund_number, gp_name, gp_clinic, gp_phone, notes";

export type MedicalFile = { id: string; name: string; size_bytes: number | null; created_at: string; appointment_id: string | null; result_id: string | null; url: string | null };
export type Row = Record<string, string | number | null> & { id: string };

/** The people records are kept for: the Captains and the children. */
export async function loadSubjects(householdId: string) {
  return (await loadCrew(householdId)).filter((c) => c.kind === "dependent" || c.label === "Captain");
}

/** A person's eq filter, for whichever of profile_id / dependent_id applies. */
const whose = (person: PersonKey) => {
  const { profile_id, dependent_id } = personColumns(person);
  return profile_id ? { col: "profile_id", id: profile_id } : { col: "dependent_id", id: dependent_id! };
};

export async function loadCard(person: PersonKey): Promise<Card | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("medical_profiles").select(CARD).eq(whose(person).col, whose(person).id).maybeSingle();
  return (data as Card | null) ?? null;
}

/** Every card the signed-in person may see (the children's, for Officers), by person. */
export async function loadCards(): Promise<Map<PersonKey, Card>> {
  const supabase = await createClient();
  const { data } = await supabase.from("medical_profiles").select(CARD);
  return new Map(((data ?? []) as (Card & { profile_id: string | null; dependent_id: string | null })[]).map((c) => [c.profile_id ? `p:${c.profile_id}` : `d:${c.dependent_id}`, c]));
}

const ORDER: Record<Kind, string> = { appointment: "starts_at", result: "taken_on", vaccination: "given_on" };

export async function loadRecords(person: PersonKey) {
  const supabase = await createClient();
  const [appointments, results, vaccinations, files] = await Promise.all([
    ...(Object.keys(KINDS) as Kind[]).map((k) =>
      supabase.from(KINDS[k].table).select("*").eq(whose(person).col, whose(person).id).order(ORDER[k], { ascending: false }),
    ),
    supabase.from("medical_files").select("id, name, size_bytes, created_at, appointment_id, result_id, path").eq(whose(person).col, whose(person).id).order("created_at", { ascending: false }),
  ]);
  for (const r of [appointments, results, vaccinations, files]) if (r.error) throw r.error;
  const fileRows = (files.data ?? []) as (Omit<MedicalFile, "url"> & { path: string })[];
  const { data: signed } = fileRows.length
    ? await supabase.storage.from(FILE_BUCKET).createSignedUrls(fileRows.map((f) => f.path), 60 * 10)
    : { data: [] };
  const urls = new Map((signed ?? []).flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [])));
  return {
    appointment: (appointments.data ?? []) as Row[],
    result: (results.data ?? []) as Row[],
    vaccination: (vaccinations.data ?? []) as Row[],
    files: fileRows.map(({ path, ...f }) => ({ ...f, url: urls.get(path) ?? null })),
  };
}

export async function loadRecord(kind: Kind, id: string): Promise<(Row & { profile_id: string | null; dependent_id: string | null }) | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from(KINDS[kind].table).select("*").eq("id", id).maybeSingle();
  return error || !data ? null : (data as Row & { profile_id: string | null; dependent_id: string | null });
}
