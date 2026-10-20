// Loading someone's own health data. Reads go through their own client, and
// row-level security returns only their rows.
import type { Habit, HealthEntry, HealthProfile } from "@/lib/constitution";
import { createClient } from "@/lib/supabase/server";

export type Checkin = { id: string; content: string; created_at: string; model: string };

const ENTRY = "id, entry_date, weight_kg, waist_cm, avg_daily_steps, golf_rounds, strength_sessions, avg_cokes_per_day, avg_water_per_day, notes";

// numeric columns come back as strings; the rest of the app wants numbers.
const NUMBERS = ["weight_kg", "waist_cm", "avg_cokes_per_day", "avg_water_per_day", "baseline_weight_kg", "baseline_waist_cm"] as const;
function numbers<T extends object>(row: T): T {
  const out = { ...row } as Record<string, unknown>;
  for (const k of NUMBERS) if (k in out && out[k] !== null) out[k] = Number(out[k]);
  return out as T;
}

const must = <T,>({ data, error }: { data: unknown; error: unknown }): T => {
  if (error) throw error;
  return data as T;
};

export async function loadHealth(): Promise<{
  profile: HealthProfile | null;
  entries: HealthEntry[];
  habits: Habit[];
  checkins: Checkin[];
}> {
  const supabase = await createClient();
  const [profile, entries, habits, checkins] = await Promise.all([
    supabase.from("health_profiles").select("baseline_date, baseline_weight_kg, baseline_waist_cm, checkin_prompt").maybeSingle(),
    supabase.from("health_entries").select(ENTRY).order("entry_date"),
    supabase.from("health_habits").select("id, name, target, active, position").order("position"),
    supabase.from("health_checkins").select("id, content, created_at, model").order("created_at", { ascending: false }).limit(20),
  ]);
  const p = must<HealthProfile | null>(profile);
  return {
    profile: p && numbers(p),
    entries: must<HealthEntry[]>(entries).map(numbers),
    habits: must<Habit[]>(habits),
    checkins: must<Checkin[]>(checkins),
  };
}

export async function loadEntry(id: string): Promise<HealthEntry | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("health_entries").select(ENTRY).eq("id", id).maybeSingle();
  return error || !data ? null : numbers(data as unknown as HealthEntry);
}
