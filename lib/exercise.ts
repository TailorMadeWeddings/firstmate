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

/** "Mon, Wed and Fri". */
export function dayNames(weekdays: string[]): string {
  const short: Record<Weekday, string> = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" };
  const names = WEEKDAYS.filter((d) => weekdays.includes(d)).map((d) => short[d]);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "");
}

/** "8", "45 s", "1 min 30 s". */
export function amount(n: number, unit: Unit): string {
  if (unit === "reps") return String(n);
  return n < 60 ? `${n} s` : `${Math.floor(n / 60)} min${n % 60 ? ` ${n % 60} s` : ""}`;
}
