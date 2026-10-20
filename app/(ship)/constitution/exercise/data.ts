// Loading exercise records. Reads go through the signed-in user's client, so
// row-level security returns only what they keep: their own, and the
// children's if they're a Captain.
import type { ProgramLog, RepUnit, RoutineExercise, Unit } from "@/lib/exercise";
import type { HealthDay } from "@/lib/health";
import { type EventRow, type Occurrence, addDays, dayKey, occurrences, startOfDay } from "@/lib/logbook";
import { type PersonKey, personColumns } from "@/lib/medical";
import type { Member } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";
import { loadCrew } from "../../logbook/data";

export type Activity = { id: string; name: string; minutes: number; profile_id: string | null; dependent_id: string | null };
export type Schedule = { id: string; activity_id: string; event: EventRow };
export type Session = { id: string; activity_id: string; starts_at: string; minutes: number; distance_km: number | null; notes: string | null; schedule_id: string | null; occurrence_start: string | null };
export type Program = { id: string; name: string; exercise: string; unit: Unit; goal: number; weekdays: string[]; active: boolean; logs: (ProgramLog & { id: string })[] };
export type DailyItem = { id: string; name: string; position: number; done: boolean };
/** A scheduled session this week, and whether it's been ticked off. */
export type Slot = Occurrence & { activity: Activity; scheduleId: string; session: Session | null };

const must = <T,>({ data, error }: { data: unknown; error: unknown }): T => {
  if (error) throw error;
  return data as T;
};

/** Whose exercise the signed-in person keeps: their own, and (Captains) the children's. */
export async function loadPeople(member: Member) {
  const crew = await loadCrew(member.householdId);
  return crew.filter((c) => (c.kind === "profile" && c.id === member.id) || (member.role === "owner" && c.kind === "dependent"));
}

const whose = (person: PersonKey) => {
  const { profile_id, dependent_id } = personColumns(person);
  return profile_id ? { col: "profile_id", id: profile_id } : { col: "dependent_id", id: dependent_id! };
};

/** A person's activities with their schedules, sessions from the last year, and this week's scheduled slots. */
export async function loadActivities(person: PersonKey, today: string) {
  const supabase = await createClient();
  const w = whose(person);
  const activities = must<Activity[]>(await supabase.from("activities").select("id, name, minutes, profile_id, dependent_id").eq(w.col, w.id).order("name"));
  if (activities.length === 0) return { activities, schedules: [] as Schedule[], sessions: [] as Session[], slots: [] as Slot[] };
  const ids = activities.map((a) => a.id);
  const yearAgo = startOfDay(addDays(today, -366)).toISOString();
  const [scheduleRows, sessionRows] = await Promise.all([
    supabase
      .from("activity_schedules")
      .select("id, activity_id, events(id, title, description, location, start_at, end_at, all_day, recurrence_rule, recurrence_ends_at)")
      .in("activity_id", ids),
    supabase
      .from("activity_sessions")
      .select("id, activity_id, starts_at, minutes, distance_km, notes, schedule_id, occurrence_start")
      .in("activity_id", ids)
      .gte("starts_at", yearAgo)
      .order("starts_at", { ascending: false }),
  ]);
  const schedules = must<{ id: string; activity_id: string; events: EventRow }[]>(scheduleRows).map((s) => ({ id: s.id, activity_id: s.activity_id, event: s.events }));
  const sessions = must<Session[]>(sessionRows).map((s) => ({ ...s, distance_km: s.distance_km === null ? null : Number(s.distance_km) }));

  // This week's slots: today and the six days after, plus yesterday's in case it's not ticked yet.
  const from = startOfDay(addDays(today, -1));
  const to = startOfDay(addDays(today, 7));
  const { data: exceptions } = schedules.length
    ? await supabase
        .from("event_exceptions")
        .select("parent_event_id, original_start_at, is_cancelled, title, description, location, start_at, end_at")
        .in("parent_event_id", schedules.map((s) => s.event.id))
    : { data: [] };
  const byEvent = new Map(schedules.map((s) => [s.event.id, s]));
  const slots: Slot[] = occurrences(schedules.map((s) => s.event), (exceptions ?? []) as never, from, to).map((o) => {
    const schedule = byEvent.get(o.eventId)!;
    return {
      ...o,
      scheduleId: schedule.id,
      activity: activities.find((a) => a.id === schedule.activity_id)!,
      session: sessions.find((s) => s.schedule_id === schedule.id && s.occurrence_start && Date.parse(s.occurrence_start) === o.originalStart.getTime()) ?? null,
    };
  });
  return { activities, schedules, sessions, slots };
}

export async function loadPrograms(): Promise<Program[]> {
  const supabase = await createClient();
  const rows = must<(Omit<Program, "logs"> & { program_logs: Program["logs"] })[]>(
    await supabase
      .from("exercise_programs")
      .select("id, name, exercise, unit, goal, weekdays, active, program_logs(id, kind, result, sets, done_on, created_at)")
      .order("created_at"),
  );
  return rows.map(({ program_logs, ...p }) => ({ ...p, logs: program_logs }));
}

export type RoutineLog = { id: string; done_on: string; notes: string | null; done: { name: string; rep_unit: RepUnit; reps: number[]; load: string | null }[] };
export type Routine = {
  id: string; name: string; category: string | null; description: string | null; warm_up: string | null; progression: string | null;
  link: string | null; rest_seconds: number | null; weekdays: string[];
  exercises: (RoutineExercise & { position: number })[];
  /** Newest first, the last 20. */
  logs: RoutineLog[];
};

/** Your routines, with exercises in order and recent logs. */
export async function loadRoutines(): Promise<Routine[]> {
  const supabase = await createClient();
  const rows = must<(Omit<Routine, "exercises" | "logs"> & { routine_exercises: Routine["exercises"]; routine_logs: RoutineLog[] })[]>(
    await supabase
      .from("routines")
      .select("id, name, category, description, warm_up, progression, link, rest_seconds, weekdays, routine_exercises(position, name, sets, reps, rep_unit, load, cue), routine_logs(id, done_on, notes, done)")
      .order("name")
      .order("done_on", { referencedTable: "routine_logs", ascending: false })
      .order("created_at", { referencedTable: "routine_logs", ascending: false })
      .limit(20, { referencedTable: "routine_logs" }),
  );
  return rows.map(({ routine_exercises, routine_logs, ...r }) => ({ ...r, exercises: routine_exercises.sort((a, b) => a.position - b.position), logs: routine_logs }));
}

export async function loadDaily(today: string): Promise<DailyItem[]> {
  const supabase = await createClient();
  const [items, ticks] = await Promise.all([
    supabase.from("daily_items").select("id, name, position").order("position").order("created_at"),
    supabase.from("daily_ticks").select("item_id").eq("day", today),
  ]);
  const done = new Set(must<{ item_id: string }[]>(ticks).map((t) => t.item_id));
  return must<Omit<DailyItem, "done">[]>(items).map((i) => ({ ...i, done: done.has(i.id) }));
}

export { dayKey };

/** One activity, by id (row-level security decides whether you see it), with whose it is. */
export async function loadActivity(id: string): Promise<(Activity & { person: PersonKey }) | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("activities").select("id, name, minutes, profile_id, dependent_id").eq("id", id).maybeSingle();
  if (error || !data) return null;
  const a = data as Activity;
  return { ...a, person: a.profile_id ? `p:${a.profile_id}` : `d:${a.dependent_id}` };
}

export async function loadSession(id: string): Promise<Session | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity_sessions")
    .select("id, activity_id, starts_at, minutes, distance_km, notes, schedule_id, occurrence_start")
    .eq("id", id)
    .maybeSingle();
  return error || !data ? null : { ...(data as Session), distance_km: data.distance_km === null ? null : Number(data.distance_km) };
}

export type HealthKey = { created_at: string; last_used_at: string | null };

/** Your last 90 days from Apple Health, oldest first, and whether a Shortcut key is set up. */
export async function loadHealth(today: string): Promise<{ days: HealthDay[]; key: HealthKey | null }> {
  const supabase = await createClient();
  const [days, key] = await Promise.all([
    supabase.from("health_daily").select("day, steps, resting_hr, avg_hr, active_kcal, exercise_minutes").gte("day", addDays(today, -89)).order("day"),
    supabase.from("health_keys").select("created_at, last_used_at").maybeSingle(),
  ]);
  return { days: must<HealthDay[]>(days), key: must<HealthKey | null>(key) };
}
