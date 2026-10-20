// Loading Duties. Reads go through the signed-in user's client, so row-level
// security decides what they see (crew only; Guests see nothing).
import type { Duty } from "@/lib/duties";
import { createClient } from "@/lib/supabase/server";

type Row = Omit<Duty, "assignee"> & { assigned_profile: string | null; assigned_dependent: string | null };

const COLUMNS = "id, title, notes, category, due_on, repeat, important, assigned_profile, assigned_dependent, done_at, created_by, created_at";

const toDuty = ({ assigned_profile, assigned_dependent, ...d }: Row): Duty => ({
  ...d,
  assignee: assigned_profile ? `p:${assigned_profile}` : assigned_dependent ? `d:${assigned_dependent}` : null,
});

// Without generated database types the client guesses shapes, so callers
// say what the rows really are.
const must = <T,>({ data, error }: { data: unknown; error: unknown }): T => {
  if (error) throw error;
  return data as T;
};

/** Everything still to do, and what was ticked off in the last fortnight. */
export async function loadDuties(): Promise<{ open: Duty[]; done: Duty[] }> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const [open, done] = await Promise.all([
    supabase.from("duties").select(COLUMNS).is("done_at", null),
    supabase.from("duties").select(COLUMNS).gte("done_at", since).order("done_at", { ascending: false }).limit(50),
  ]);
  return { open: must<Row[]>(open).map(toDuty), done: must<Row[]>(done).map(toDuty) };
}

export async function loadDuty(id: string): Promise<Duty | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("duties").select(COLUMNS).eq("id", id).maybeSingle();
  // A malformed id is "not found" too.
  return error || !data ? null : toDuty(data as unknown as Row);
}
