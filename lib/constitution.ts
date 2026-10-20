// Constitution: personal health tracking. The weekly numbers, what changed,
// and what the weekly check-in is told. Pure, so it's testable.

export type HealthEntry = {
  id: string;
  entry_date: string;
  weight_kg: number | null;
  waist_cm: number | null;
  avg_daily_steps: number | null;
  golf_rounds: number | null;
  strength_sessions: number | null;
  avg_cokes_per_day: number | null;
  avg_water_per_day: number | null;
  notes: string | null;
};

export type HealthProfile = {
  baseline_date: string;
  baseline_weight_kg: number | null;
  baseline_waist_cm: number | null;
  checkin_prompt: string | null;
};

export type Habit = { id: string; name: string; target: string | null; active: boolean; position: number };

/** The numbers on an entry, in form order, with how they're shown. */
export const MEASURES = [
  { key: "waist_cm", label: "Waist", unit: "cm", step: 0.1, max: 300 },
  { key: "weight_kg", label: "Weight", unit: "kg", step: 0.05, max: 400 },
  { key: "avg_daily_steps", label: "Steps a day (average)", unit: "steps", step: 1, max: 100000 },
  { key: "golf_rounds", label: "Golf rounds this week", unit: "rounds", step: 1, max: 21 },
  { key: "strength_sessions", label: "Strength sessions this week", unit: "sessions", step: 1, max: 21 },
  { key: "avg_cokes_per_day", label: "Cokes a day (average)", unit: "a day", step: 0.1, max: 50 },
  { key: "avg_water_per_day", label: "Water a day (litres, average)", unit: "L a day", step: 0.1, max: 50 },
] as const;
export type Measure = (typeof MEASURES)[number]["key"];

/** Habits to start with; each person changes them to suit. */
export const STARTER_HABITS = [
  { name: "Cut out soft drinks", target: "No Coke" },
  { name: "Golf", target: "3 rounds a week, walking 7–8 km each" },
  { name: "Strength training", target: "2 sessions a week, alternating Session A and Session B (compound lifts: dumbbells, cables, trap bar)" },
];

/** Strength sessions alternate A and B; this counts every one logged (assuming the first was A). */
export function nextStrengthSession(entries: HealthEntry[]): { next: "A" | "B"; total: number } {
  const total = entries.reduce((sum, e) => sum + (e.strength_sessions ?? 0), 0);
  return { next: total % 2 === 0 ? "A" : "B", total };
}

/** Oldest first. */
export const byDate = (entries: HealthEntry[]) => [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date));

/** The latest reading of a measure, and the one before it. */
export function latest(entries: HealthEntry[], key: Measure): { now: number | null; before: number | null } {
  const values = byDate(entries).map((e) => e[key]).filter((v): v is number => v !== null);
  return { now: values.at(-1) ?? null, before: values.at(-2) ?? null };
}

/** "−1.5", "+0.3", "0": a change, signed, to one decimal place. */
export function change(from: number | null, to: number | null): string | null {
  if (from === null || to === null) return null;
  const d = Math.round((to - from) * 10) / 10;
  return d === 0 ? "0" : `${d > 0 ? "+" : "−"}${Math.abs(d)}`;
}

/** For "use last week's": each measure's most recent value. */
export function lastValues(entries: HealthEntry[]): Partial<Record<Measure, number>> {
  return Object.fromEntries(
    MEASURES.map((m) => [m.key, latest(entries, m.key).now]).filter(([, v]) => v !== null),
  );
}

// ---------- the weekly check-in ----------

/** The built-in check-in instructions. Each person can replace them in settings. */
export const DEFAULT_PROMPT = `You are a direct, evidence-based health coach doing a weekly check-in. You've worked with this person every week since their baseline and you know their plan.

How you talk:
- Plain, direct and steady. No hype, no exclamation marks, no "amazing" or "crushing it", no toxic positivity.
- Say what the numbers actually show, including when a week was flat or went the wrong way. A stall is information, not failure.
- Gentle accountability: if a habit slipped, name it plainly, say what it probably cost, then move on to what to do this week. No guilt, no lecturing.
- Explain the physiology behind what's happening when it helps: water and glycogen swings, why the scale lags the tape measure, why fat loss shows at the waist, what strength work does for body composition, the effect of sleep, stress and recovery.

What you focus on:
- Waist is the honest fat-loss measure. Lead with it. Weight is supporting context; call week-to-week scale noise (water, salt, glycogen, gut contents) what it is.
- Trends over several weeks matter more than any single reading.
- The habits and targets you're given, including which strength session is next.
- No calorie counting, ever. It's deliberately left out so the plan stays sustainable. Don't suggest tracking calories or macros, and don't put numbers on food.

Shape of the check-in:
- Start with the waist: this week's reading, the change since the last entry, and since baseline.
- Then weight, briefly, in context.
- Then the habits: a sentence or two each where there's something worth saying.
- Finish with one or two specific, practical focuses for the coming week.
- About 250 to 400 words, in short paragraphs. Use **bold** sparingly and simple "- " bullet points if they help; no headings or tables. Australian English.

If a week's data is missing or partial, work with what's there and never invent numbers. You're not a doctor: if something looks medically concerning (very rapid loss, or symptoms mentioned in the notes), suggest seeing a GP, briefly and calmly.`;

const show = (v: number | null) => (v === null ? "—" : String(v));

/** What the check-in is told: baseline, habits, and the last few weeks, most recent last. */
export function checkinMessage({
  name,
  today,
  profile,
  habits,
  entries,
  weeks = 8,
}: {
  name: string;
  today: string;
  profile: HealthProfile;
  habits: Habit[];
  entries: HealthEntry[];
  weeks?: number;
}): string {
  const all = byDate(entries);
  const recent = all.slice(-weeks);
  const strength = nextStrengthSession(all);
  const active = habits.filter((h) => h.active).sort((a, b) => a.position - b.position);
  const rows = recent.map((e) =>
    [e.entry_date, ...MEASURES.map((m) => show(e[m.key])), (e.notes ?? "").replace(/\s+/g, " ").trim() || "—"].join(" | "),
  );
  return [
    `Weekly check-in for ${name}. Today is ${today}.`,
    "",
    `Baseline (${profile.baseline_date}): waist ${show(profile.baseline_waist_cm)} cm, weight ${show(profile.baseline_weight_kg)} kg.`,
    "",
    "Habits and targets:",
    ...(active.length ? active.map((h) => `- ${h.name}${h.target ? `: ${h.target}` : ""}`) : ["- (none set)"]),
    "",
    `Strength sessions logged since baseline: ${strength.total}. Next session: ${strength.next}.`,
    "",
    `Entries, oldest first (the last ${recent.length} of ${all.length}):`,
    ["Date", ...MEASURES.map((m) => `${m.label} (${m.unit})`), "Notes"].join(" | "),
    ...rows,
    "",
    "Write this week's check-in.",
  ].join("\n");
}

// ---------- showing a check-in ----------

export type Block = { kind: "p"; text: string } | { kind: "ul"; items: string[] };

/** Paragraphs and "- " lists: all the formatting a check-in uses. */
export function blocks(text: string): Block[] {
  const out: Block[] = [];
  for (const chunk of text.split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    let para: string[] = [];
    const flush = () => {
      if (para.length) out.push({ kind: "p", text: para.join(" ") });
      para = [];
    };
    for (const line of lines) {
      const item = line.match(/^[-*•]\s+(.*)$/);
      if (item) {
        flush();
        const last = out.at(-1);
        if (last?.kind === "ul") last.items.push(item[1]);
        else out.push({ kind: "ul", items: [item[1]] });
      } else {
        // A paragraph after a list starts fresh.
        if (out.at(-1)?.kind === "ul" && para.length === 0 && lines.indexOf(line) > 0) flush();
        para.push(line.replace(/^#+\s*/, ""));
      }
    }
    flush();
  }
  return out;
}

/** "**bold**" pieces of a line, for rendering. */
export const boldParts = (line: string) => line.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((p) => (p.startsWith("**") && p.endsWith("**") ? { bold: true, text: p.slice(2, -2) } : { bold: false, text: p }));
