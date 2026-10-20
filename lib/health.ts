// Apple Health's daily numbers, as an iPhone Shortcut sends them to
// /api/health. Shortcuts can send numbers as text ("8,432", "61.5 count/min"),
// so this reads both, and rejects anything outside a sensible range.
import { createHash } from "node:crypto";
import { addDays } from "./logbook.ts";

export type HealthDay = {
  day: string;
  steps: number | null;
  resting_hr: number | null;
  avg_hr: number | null;
  active_kcal: number | null;
  exercise_minutes: number | null;
};

/** Keys are kept only as their sha256. */
export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

const RANGES = {
  steps: [0, 200000],
  resting_hr: [20, 250],
  avg_hr: [20, 250],
  active_kcal: [0, 20000],
  exercise_minutes: [0, 1440],
} as const;

/** A whole number from a number or a Shortcut's text; null when it's blank; NaN when it's nonsense. */
function amount(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Math.round(raw);
  if (typeof raw !== "string") return NaN;
  const m = raw.replace(/[,\s]/g, "").match(/^-?\d+(\.\d+)?/);
  return m ? Math.round(Number(m[0])) : NaN;
}

/**
 * One day ({ steps, … }) or a list of them, each with an optional day
 * ("2026-10-20"; today in Sydney if left out), as rows to save, or what's
 * wrong with it. Energy can come as active_kj instead, for phones set to kilojoules.
 */
export function readHealthDays(body: unknown, today: string): HealthDay[] | string {
  const list = Array.isArray(body) ? body : [body];
  if (list.length === 0 || list.length > 400) return "Send one day, or a list of up to 400.";
  const days = new Map<string, HealthDay>();
  for (const item of list) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return "Each day should be an object like { \"steps\": 8432 }.";
    const raw = item as Record<string, unknown>;
    const day = raw.day === undefined || raw.day === "" ? today : String(raw.day).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || addDays(day, 0) !== day) return `“${String(raw.day)}” isn't a day like 2026-10-20.`;
    if (day > addDays(today, 1) || day < addDays(today, -400)) return `${day} is too far from today.`;
    const kj = amount(raw.active_kj);
    const row: HealthDay = {
      day,
      steps: amount(raw.steps),
      resting_hr: amount(raw.resting_hr),
      avg_hr: amount(raw.avg_hr),
      active_kcal: raw.active_kcal === undefined && kj !== null ? Math.round(kj / 4.184) : amount(raw.active_kcal),
      exercise_minutes: amount(raw.exercise_minutes),
    };
    for (const [field, [lo, hi]] of Object.entries(RANGES)) {
      const v = row[field as keyof typeof RANGES];
      if (v !== null && !(v >= lo && v <= hi)) return `${field} on ${day} should be a number from ${lo} to ${hi}.`;
    }
    days.set(day, row); // the last one for a day wins
  }
  return [...days.values()];
}
