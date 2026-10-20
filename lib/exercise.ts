// Exercise: hours from sessions, and progressive programs in the spirit of
// 100 Pushups (test your max, train from it in five sets, re-test, repeat
// until the goal). The numbers are our own simple progression, not the
// app's tables. Pure, so it's testable.
import { WEEKDAYS, type Weekday } from "./logbook.ts";

/** Offered when adding an activity; anything else can be typed. */
export const ACTIVITY_IDEAS = ["Aikido", "Golf", "Gym", "Swimming", "Running", "Walking", "Cycling", "Tennis", "Yoga", "Pilates", "Soccer", "Netball", "Dancing"];

/** "45 min", "1 h", "3 h 15 min". */
export function formatMinutes(total: number): string {
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Minutes of sessions starting in [from, to). */
export const minutesIn = (sessions: { starts_at: string; minutes: number }[], from: Date, to: Date) =>
  sessions.filter((s) => Date.parse(s.starts_at) >= from.getTime() && Date.parse(s.starts_at) < to.getTime()).reduce((sum, s) => sum + s.minutes, 0);

// ---------- programs ----------

export type Unit = "reps" | "seconds";

export const STARTER_PROGRAMS = [
  { key: "pushups", name: "100 push-ups", exercise: "Push-ups", unit: "reps", goal: 100, weekdays: ["MO", "WE", "FR"] },
  { key: "squats", name: "200 squats", exercise: "Squats", unit: "reps", goal: 200, weekdays: ["TU", "TH", "SA"] },
  { key: "situps", name: "200 sit-ups", exercise: "Sit-ups", unit: "reps", goal: 200, weekdays: ["MO", "WE", "FR"] },
  { key: "plank", name: "5-minute plank", exercise: "Plank", unit: "seconds", goal: 300, weekdays: ["TU", "TH", "SA"] },
] as const satisfies readonly { key: string; name: string; exercise: string; unit: Unit; goal: number; weekdays: Weekday[] }[];

/** Workouts between tests: two weeks at three a week. */
export const WORKOUTS_PER_BLOCK = 6;

// How hard each workout in a block is, as a share of your tested max per set.
const INTENSITY = [0.45, 0.5, 0.55, 0.6, 0.65, 0.7];

export type Workout = { sets: number[]; lastAtLeast: number; restSeconds: number };

/**
 * A workout from your latest test: four sets at the block's intensity (the
 * first and last two a little lighter), then a fifth "as many as you can",
 * with a floor to beat. Seconds round to 5; nothing goes below 1.
 */
export function workoutFor(max: number, index: number, unit: Unit): Workout {
  const f = INTENSITY[Math.min(Math.max(index, 0), INTENSITY.length - 1)];
  const round = (v: number) => (unit === "seconds" ? Math.max(5, Math.round(v / 5) * 5) : Math.max(1, Math.round(v)));
  const base = max * f;
  return {
    sets: [round(base * 0.9), round(base), round(base * 0.9), round(base * 0.9)],
    lastAtLeast: round(base * 1.1),
    restSeconds: 60 + 15 * (index % 3),
  };
}

export type ProgramLog = { kind: "test" | "workout"; result: number | null; sets: number[] | null; done_on: string; created_at: string };

export type ProgramState = {
  /** Your latest test result, if you've done one. */
  max: number | null;
  best: number | null;
  reached: boolean;
  /** Which block of workouts you're in (a new one after each test). */
  block: number;
  next: { kind: "test" } | { kind: "workout"; index: number; workout: Workout };
};

/** Where a program's at: test first; then workouts from that test; re-test after each block. */
export function programState(logs: ProgramLog[], goal: number, unit: Unit): ProgramState {
  const ordered = [...logs].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const tests = ordered.filter((l) => l.kind === "test");
  const lastTest = tests.at(-1);
  const max = lastTest?.result ?? null;
  const best = tests.length ? Math.max(...tests.map((t) => t.result ?? 0)) : null;
  const since = lastTest ? ordered.slice(ordered.indexOf(lastTest) + 1).filter((l) => l.kind === "workout").length : 0;
  const reached = best !== null && best >= goal;
  if (max === null || since >= WORKOUTS_PER_BLOCK) return { max, best, reached, block: tests.length, next: { kind: "test" } };
  return { max, best, reached, block: tests.length, next: { kind: "workout", index: since, workout: workoutFor(max, since, unit) } };
}

const WEEKDAY_OF_UTC: Weekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Whether a calendar day ("YYYY-MM-DD") is one of the program's training days. */
export const isTrainingDay = (weekdays: string[], day: string) => weekdays.includes(WEEKDAY_OF_UTC[new Date(`${day}T00:00:00Z`).getUTCDay()]);

export const DAY_SHORT: Record<Weekday, string> = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" };

/** "Mon, Wed and Fri". */
export function dayNames(weekdays: string[]): string {
  const names = WEEKDAYS.filter((d) => weekdays.includes(d)).map((d) => DAY_SHORT[d]);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "");
}

/** "8", "45 s", "1 min 30 s". */
export function amount(n: number, unit: Unit): string {
  if (unit === "reps") return String(n);
  return n < 60 ? `${n} s` : `${Math.floor(n / 60)} min${n % 60 ? ` ${n % 60} s` : ""}`;
}

// ---------- routines ----------

export const REP_UNITS = ["reps", "per_side", "seconds"] as const;
export type RepUnit = (typeof REP_UNITS)[number];
export type RoutineExercise = { name: string; sets: number; reps: number; rep_unit: RepUnit; load: string | null; cue: string | null };

/** "3 × 12", "3 × 8 per side", "3 × 30 s". */
export const prescription = (sets: number, reps: number, unit: RepUnit) =>
  `${sets} × ${unit === "seconds" ? amount(reps, "seconds") : reps}${unit === "per_side" ? " per side" : ""}`;

/** Weekdays from "Mon", "monday" or "MO", in week order; or what's wrong. */
export function weekdaysFrom(names: unknown): Weekday[] | string {
  if (!Array.isArray(names)) return "days should be a list, like [\"Mon\", \"Wed\", \"Fri\"].";
  const found = new Set<Weekday>();
  for (const n of names) {
    const d = WEEKDAYS.find((w) => String(n).trim().slice(0, 2).toUpperCase() === w);
    if (!d || !/^[a-z]{2,9}$/i.test(String(n).trim())) return `${n} isn't a day of the week.`;
    found.add(d);
  }
  return WEEKDAYS.filter((d) => found.has(d));
}

/** A routine's exercises from Claude, sorted by order if given; or what's wrong. */
export function exercisesFrom(raw: unknown): RoutineExercise[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return "exercises should be a list with at least one exercise.";
  if (raw.length > 40) return "40 exercises at most.";
  const whole = (v: unknown, max: number) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= max ? (v as number) : null);
  const text = (v: unknown, max: number) => (v === undefined || v === null || v === "" ? null : typeof v === "string" && v.trim().length <= max ? v.trim() || null : undefined);
  const out: [number, RoutineExercise][] = [];
  for (const [i, e] of raw.entries()) {
    const x = (e ?? {}) as Record<string, unknown>;
    const name = text(x.name, 80);
    const label = name ?? `Exercise ${i + 1}`;
    if (!name) return `Exercise ${i + 1} needs a name.`;
    const sets = whole(x.sets, 20);
    const reps = whole(x.reps, 10000);
    if (sets === null) return `${label}: sets should be a whole number, 1 to 20.`;
    if (reps === null) return `${label}: reps should be a whole number, 1 or more.`;
    const unit = x.rep_unit ?? "reps";
    if (!REP_UNITS.includes(unit as RepUnit)) return `${label}: rep_unit should be one of ${REP_UNITS.join(", ")}.`;
    const load = text(x.load, 60);
    const cue = text(x.cue, 300);
    if (load === undefined) return `${label}: load should be short text, like "5-8 kg DB".`;
    if (cue === undefined) return `${label}: cue should be text, 300 characters at most.`;
    out.push([typeof x.order === "number" ? x.order : i + 1, { name, sets, reps, rep_unit: unit as RepUnit, load, cue }]);
  }
  return out.sort((a, b) => a[0] - b[0]).map(([, e]) => e);
}
