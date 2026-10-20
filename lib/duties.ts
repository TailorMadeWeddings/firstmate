// Duties, the family to-do list: when things are due, how they group, and
// where a repeating one goes next. Days are "YYYY-MM-DD" in Sydney, as in
// the Logbook. Pure, so it's testable.
import { addDays } from "./logbook.ts";

export const REPEATS = {
  daily: "Every day",
  weekly: "Every week",
  fortnightly: "Every fortnight",
  monthly: "Every month",
  yearly: "Every year",
} as const;
export type Repeat = keyof typeof REPEATS;

export type Duty = {
  id: string;
  title: string;
  notes: string | null;
  category: string | null;
  due_on: string | null;
  repeat: Repeat | null;
  important: boolean;
  /** "p:<profile id>" or "d:<dependent id>", as on the Logbook. */
  assignee: string | null;
  done_at: string | null;
  created_by: string;
  created_at: string;
};

/** A month or year on, keeping the day where the month has it (31 Jan → 28 Feb). */
function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

const step = (day: string, repeat: Repeat) =>
  repeat === "daily"
    ? addDays(day, 1)
    : repeat === "weekly"
      ? addDays(day, 7)
      : repeat === "fortnightly"
        ? addDays(day, 14)
        : addMonths(day, repeat === "monthly" ? 1 : 12);

/**
 * Where a repeating duty goes when it's ticked off: its next date after the
 * one it was due, and after today, so a late one doesn't come back overdue.
 * ponytail: monthly drifts after a short month (31st → 28th → 28th); keep the
 * original day in a column if that matters.
 */
export function nextDue(due: string, repeat: Repeat, today: string): string {
  let next = step(due, repeat);
  while (next <= today) next = step(next, repeat);
  return next;
}

export const GROUPS = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  week: "This week",
  later: "Later",
  someday: "Whenever",
} as const;
export type Group = keyof typeof GROUPS;

export function groupOf(due: string | null, today: string): Group {
  if (!due) return "someday";
  if (due < today) return "overdue";
  if (due === today) return "today";
  if (due === addDays(today, 1)) return "tomorrow";
  if (due < addDays(today, 7)) return "week";
  return "later";
}

const format = (day: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", { ...opts, timeZone: "UTC" });

/** "Today", "Yesterday", "3 days late", "Thursday", "12 Nov", "3 Feb 2027". */
export function dueLabel(due: string, today: string): string {
  if (due === today) return "Today";
  if (due === addDays(today, 1)) return "Tomorrow";
  if (due === addDays(today, -1)) return "Yesterday";
  const days = Math.round((Date.parse(due) - Date.parse(today)) / 86_400_000);
  if (days < 0 && days > -7) return `${-days} days late`;
  if (days > 0 && days < 7) return format(due, { weekday: "long" });
  return format(due, { day: "numeric", month: "short", ...(due.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}) });
}

/** Open duties in groups, in order; within each, important first, then soonest, then oldest. */
export function grouped(duties: Duty[], today: string): { group: Group; duties: Duty[] }[] {
  const order = (a: Duty, b: Duty) =>
    Number(b.important) - Number(a.important) ||
    (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999") ||
    a.created_at.localeCompare(b.created_at);
  return (Object.keys(GROUPS) as Group[])
    .map((group) => ({ group, duties: duties.filter((d) => groupOf(d.due_on, today) === group).sort(order) }))
    .filter((g) => g.duties.length > 0);
}
