"use server";

// Saving exercise records, through the signed-in user's own client:
// row-level security lets people keep their own, and Captains the children's.
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hashKey } from "@/lib/health";
import { type Repeat, WEEKDAYS, type Weekday, addDays, dayKey, fromWall, ruleFor, startOfDay } from "@/lib/logbook";
import { type PersonKey, isPersonKey, personColumns } from "@/lib/medical";
import { currentMedicalMember } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";

type Result = string | null;

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const done = () => {
  revalidatePath("/constitution", "layout");
  revalidatePath("/logbook", "layout");
  revalidatePath("/");
};
const home = (person?: PersonKey) => redirect(`/constitution/exercise${person ? `?person=${encodeURIComponent(person)}` : ""}`);

function failed(error: { code?: string; message?: string }): string {
  if (error.code === "42501") return "You can only keep your own exercise records (and, as a Captain, the children's).";
  if (error.code === "P0040") return "That's gone.";
  if (error.code === "23505") return "That one's already ticked off.";
  console.error(error);
  return "Couldn't save that. Try again.";
}

const whole = (raw: string, min: number, max: number) => {
  const n = Number(raw);
  return raw && Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/** "2026-10-20" and "19:00", in Sydney time, as an instant. */
const at = (day: string, time: string) => {
  const d = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = time.match(/^(\d{2}):(\d{2})$/);
  return d && t ? fromWall({ y: +d[1], m: +d[2], d: +d[3], h: +t[1], min: +t[2] }) : null;
};

// ---------- activities ----------

export async function addActivity(person: PersonKey, _: Result, form: FormData): Promise<Result> {
  const member = await currentMedicalMember();
  const name = text(form, "name");
  const minutes = whole(text(form, "minutes") || "60", 5, 600);
  if (!isPersonKey(person)) return "Pick who it's for.";
  if (!name || name.length > 60) return "Give the activity a short name.";
  if (minutes === null) return "Usual length is in minutes, 5 to 600.";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activities")
    .insert({ ...personColumns(person), household_id: member.householdId, name, minutes })
    .select("id")
    .single();
  if (error) return failed(error);
  done();
  redirect(`/constitution/exercise/activity/${data.id}`);
}

export async function saveActivity(activityId: string, _: Result, form: FormData): Promise<Result> {
  await currentMedicalMember();
  const name = text(form, "name");
  const minutes = whole(text(form, "minutes"), 5, 600);
  if (!name || name.length > 60) return "Give the activity a short name.";
  if (minutes === null) return "Usual length is in minutes, 5 to 600.";
  const supabase = await createClient();
  const { error } = await supabase.from("activities").update({ name, minutes }).eq("id", activityId).select("id").single();
  if (error) return failed(error);
  done();
  return null;
}

export async function deleteActivity(activityId: string, person: PersonKey): Promise<Result> {
  await currentMedicalMember();
  const supabase = await createClient();
  const { error } = await supabase.from("activities").delete().eq("id", activityId).select("id").single();
  if (error) return failed(error);
  done();
  home(person);
  return null;
}

/** A repeating time slot: which days, what time, how long, from when, until when. It goes on the Logbook. */
export async function saveSchedule(activityId: string, scheduleId: string | null, _: Result, form: FormData): Promise<Result> {
  await currentMedicalMember();
  const days = WEEKDAYS.filter((d) => form.get(`day_${d}`) === "on") as Weekday[];
  const from = text(form, "from") || dayKey(new Date());
  const start = at(from, text(form, "time"));
  const minutes = whole(text(form, "minutes"), 5, 600);
  const until = text(form, "until");
  const repeat = (text(form, "repeat") === "fortnightly" ? "fortnightly" : "weekly") as Repeat;
  if (days.length === 0) return "Pick at least one day.";
  if (!start) return "Pick a start time.";
  if (minutes === null) return "How long is in minutes, 5 to 600.";
  if (until && (!/^\d{4}-\d{2}-\d{2}$/.test(until) || until < from)) return "The end date has to be after it starts.";
  const supabase = await createClient();
  const { error } = await supabase.rpc("exercise_save_schedule", {
    p_schedule: scheduleId,
    p_activity: activityId,
    p_start: start.toISOString(),
    p_minutes: minutes,
    p_rule: ruleFor(repeat, days, from),
    p_until: until ? startOfDay(addDays(until, 1)).toISOString() : null,
  });
  if (error) return failed(error);
  done();
  return null;
}

export async function deleteSchedule(scheduleId: string): Promise<Result> {
  await currentMedicalMember();
  const supabase = await createClient();
  const { error } = await supabase.from("activity_schedules").delete().eq("id", scheduleId).select("id").single();
  if (error) return failed(error);
  done();
  return null;
}

// ---------- sessions ----------

/** One tap: ticks off a scheduled session as done, for its usual length. Details can be added after. */
export async function tickSlot(activityId: string, scheduleId: string, occurrence: string, minutes: number): Promise<Result> {
  await currentMedicalMember();
  const supabase = await createClient();
  const { error } = await supabase.rpc("exercise_save_session", {
    p_session: null,
    p_activity: activityId,
    p_starts: occurrence,
    p_minutes: minutes,
    p_distance: null,
    p_notes: null,
    p_schedule: scheduleId,
    p_occurrence: occurrence,
  });
  if (error) return failed(error);
  done();
  return null;
}

/** Logs a one-off session (it goes on the Logbook), or changes a logged one. */
export async function saveSession(activityId: string, sessionId: string | null, person: PersonKey, _: Result, form: FormData): Promise<Result> {
  await currentMedicalMember();
  const starts = at(text(form, "date"), text(form, "time"));
  const minutes = whole(text(form, "minutes"), 1, 1440);
  const distanceRaw = text(form, "distance_km").replace(",", ".");
  const distance = distanceRaw ? Number(distanceRaw) : null;
  if (!starts) return "Pick when it was.";
  if (minutes === null) return "How long is in minutes.";
  if (distance !== null && !(distance >= 0 && distance <= 1000)) return "Distance is in kilometres, like 2.5.";
  const supabase = await createClient();
  const { error } = await supabase.rpc("exercise_save_session", {
    p_session: sessionId,
    p_activity: activityId,
    p_starts: starts.toISOString(),
    p_minutes: minutes,
    p_distance: distance,
    p_notes: text(form, "notes") || null,
  });
  if (error) return failed(error);
  done();
  home(person);
  return null;
}

export async function deleteSession(sessionId: string, person: PersonKey): Promise<Result> {
  await currentMedicalMember();
  const supabase = await createClient();
  const { error } = await supabase.from("activity_sessions").delete().eq("id", sessionId).select("id").single();
  if (error) return failed(error);
  done();
  home(person);
  return null;
}

// ---------- programs ----------

export async function saveProgram(programId: string | null, _: Result, form: FormData): Promise<Result> {
  const member = await currentMedicalMember();
  const name = text(form, "name");
  const exercise = text(form, "exercise");
  const unit = text(form, "unit") === "seconds" ? "seconds" : "reps";
  const goal = whole(text(form, "goal"), 1, 10000);
  const weekdays = WEEKDAYS.filter((d) => form.get(`day_${d}`) === "on");
  if (!name || name.length > 60) return "Give the program a short name.";
  if (!exercise || exercise.length > 60) return "Say which exercise.";
  if (goal === null) return "The goal is a whole number.";
  if (weekdays.length === 0) return "Pick at least one training day.";
  const row = { name, exercise, unit, goal, weekdays, active: programId ? form.get("active") === "on" : true };
  const supabase = await createClient();
  const { data, error } = programId
    ? await supabase.from("exercise_programs").update(row).eq("id", programId).select("id").single()
    : await supabase.from("exercise_programs").insert({ ...row, household_id: member.householdId, profile_id: member.id }).select("id").single();
  if (error) return failed(error);
  done();
  redirect(`/constitution/exercise/program/${data.id}`);
}

export async function deleteProgram(programId: string): Promise<Result> {
  await currentMedicalMember();
  const supabase = await createClient();
  const { error } = await supabase.from("exercise_programs").delete().eq("id", programId).select("id").single();
  if (error) return failed(error);
  done();
  home();
  return null;
}

/** A test (your max, in one go) or a workout (each set as done). */
export async function logProgram(programId: string, kind: "test" | "workout", _: Result, form: FormData): Promise<Result> {
  const member = await currentMedicalMember();
  let row: { result: number } | { sets: number[] };
  if (kind === "test") {
    const result = whole(text(form, "result"), 0, 100000);
    if (result === null) return "Enter how many you did (or how many seconds).";
    row = { result };
  } else {
    const sets = form.getAll("set").map((v) => Number(v));
    if (sets.length === 0 || sets.some((n) => !Number.isInteger(n) || n < 0 || n > 100000)) return "Each set is a whole number.";
    row = { sets };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("program_logs")
    .insert({ ...row, program_id: programId, household_id: member.householdId, profile_id: member.id, done_on: dayKey(new Date()), kind });
  if (error) return failed(error);
  done();
  return null;
}

export async function undoProgramLog(logId: string): Promise<Result> {
  await currentMedicalMember();
  const supabase = await createClient();
  const { error } = await supabase.from("program_logs").delete().eq("id", logId).select("id").single();
  if (error) return failed(error);
  done();
  return null;
}

// ---------- routines (Claude writes them; here they're logged and deleted) ----------

/** A routine done today: each exercise's reps per set and load, as actually done. */
export async function logRoutine(routineId: string, _: Result, form: FormData): Promise<Result> {
  const member = await currentMedicalMember();
  const supabase = await createClient();
  const { data: exercises, error: readError } = await supabase.from("routine_exercises").select("position, name, rep_unit").eq("routine_id", routineId).order("position");
  if (readError) return failed(readError);
  const did = [];
  for (const e of exercises) {
    const reps = form.getAll(`reps_${e.position}`).map((v) => Number(v));
    if (reps.some((n) => !Number.isInteger(n) || n < 0 || n > 10000)) return `${e.name}: each set is a whole number.`;
    const load = text(form, `load_${e.position}`);
    if (load.length > 60) return `${e.name}: keep the load short.`;
    did.push({ name: e.name, rep_unit: e.rep_unit, reps, load: load || null });
  }
  const notes = text(form, "notes");
  if (notes.length > 2000) return "Notes are too long.";
  const { error } = await supabase
    .from("routine_logs")
    .insert({ routine_id: routineId, household_id: member.householdId, profile_id: member.id, done_on: dayKey(new Date()), notes: notes || null, done: did });
  if (error) return failed(error);
  done();
  return null;
}

export async function undoRoutineLog(logId: string): Promise<Result> {
  await currentMedicalMember();
  const supabase = await createClient();
  const { error } = await supabase.from("routine_logs").delete().eq("id", logId).select("id").single();
  if (error) return failed(error);
  done();
  return null;
}

export async function deleteRoutine(routineId: string): Promise<Result> {
  await currentMedicalMember();
  const supabase = await createClient();
  const { error } = await supabase.from("routines").delete().eq("id", routineId).select("id").single();
  if (error) return failed(error);
  done();
  home();
  return null;
}

// ---------- the daily checklist ----------

export async function addDailyItem(_: Result, form: FormData): Promise<Result> {
  const member = await currentMedicalMember();
  const name = text(form, "name");
  if (!name || name.length > 80) return "Keep it short, like “Hamstring stretch, 2 min”.";
  const supabase = await createClient();
  const { error } = await supabase.from("daily_items").insert({ name, household_id: member.householdId, profile_id: member.id, position: Date.now() % 1_000_000_000 });
  if (error) return failed(error);
  done();
  return null;
}

export async function deleteDailyItem(itemId: string): Promise<Result> {
  await currentMedicalMember();
  const supabase = await createClient();
  const { error } = await supabase.from("daily_items").delete().eq("id", itemId).select("id").single();
  if (error) return failed(error);
  done();
  return null;
}

/** Ticks a daily item off for today, or back on. */
export async function tickDaily(itemId: string, isDone: boolean): Promise<Result> {
  const member = await currentMedicalMember();
  const today = dayKey(new Date());
  const supabase = await createClient();
  const { error } = isDone
    ? await supabase.from("daily_ticks").upsert({ item_id: itemId, day: today, household_id: member.householdId, profile_id: member.id }, { onConflict: "item_id,day" })
    : await supabase.from("daily_ticks").delete().eq("item_id", itemId).eq("day", today);
  if (error) return failed(error);
  done();
  return null;
}

// ---------- Apple Health ----------

/** A new key for the iPhone Shortcut, replacing any old one. Shown once: only its hash is kept. */
export async function makeHealthKey(): Promise<{ key: string } | { error: string }> {
  const member = await currentMedicalMember();
  const key = `fm_${randomBytes(32).toString("base64url")}`;
  const supabase = await createClient();
  const { error } = await supabase
    .from("health_keys")
    .upsert({ profile_id: member.id, household_id: member.householdId, key_hash: hashKey(key), created_at: new Date().toISOString(), last_used_at: null });
  if (error) return { error: failed(error) };
  revalidatePath("/constitution/exercise");
  return { key };
}

/** Stops the Shortcut sending. The numbers already sent stay. */
export async function dropHealthKey(): Promise<Result> {
  const member = await currentMedicalMember();
  const supabase = await createClient();
  const { error } = await supabase.from("health_keys").delete().eq("profile_id", member.id);
  if (error) return failed(error);
  revalidatePath("/constitution/exercise");
  return null;
}
