import assert from "node:assert/strict";
import { test } from "node:test";
import { type HealthEntry, blocks, boldParts, change, checkinMessage, lastValues, latest, nextStrengthSession } from "./constitution.ts";

const entry = (entry_date: string, values: Partial<HealthEntry> = {}): HealthEntry => ({
  id: entry_date, entry_date, weight_kg: null, waist_cm: null, avg_daily_steps: null, golf_rounds: null,
  strength_sessions: null, avg_cokes_per_day: null, avg_water_per_day: null, notes: null, ...values,
});

const entries = [
  entry("2026-10-12", { waist_cm: 111, weight_kg: 99.2, strength_sessions: 2, avg_cokes_per_day: 0.5 }),
  entry("2026-10-19", { waist_cm: 110.5, strength_sessions: 1, notes: "Sore back\nskipped golf" }),
  entry("2026-10-05", { waist_cm: 112, weight_kg: 99.9, strength_sessions: 2 }),
];

test("latest readings, changes and last week's values skip the gaps", () => {
  assert.deepEqual(latest(entries, "waist_cm"), { now: 110.5, before: 111 });
  assert.deepEqual(latest(entries, "weight_kg"), { now: 99.2, before: 99.9 }); // the 19th had no weight
  assert.equal(change(116, 110.5), "−5.5");
  assert.equal(change(98.7, 99), "+0.3");
  assert.equal(change(100, 100), "0");
  assert.equal(change(null, 100), null);
  assert.deepEqual(lastValues(entries), { waist_cm: 110.5, weight_kg: 99.2, strength_sessions: 1, avg_cokes_per_day: 0.5 });
});

test("strength sessions alternate A and B", () => {
  assert.deepEqual(nextStrengthSession([]), { next: "A", total: 0 });
  assert.deepEqual(nextStrengthSession(entries), { next: "B", total: 5 });
});

test("the check-in is told the baseline, the habits and the recent weeks, oldest first", () => {
  const message = checkinMessage({
    name: "Ben",
    today: "2026-10-20",
    profile: { baseline_date: "2026-04-23", baseline_weight_kg: 102.35, baseline_waist_cm: 116, checkin_prompt: null },
    habits: [
      { id: "1", name: "Golf", target: "3 rounds a week", active: true, position: 1 },
      { id: "2", name: "Old habit", target: null, active: false, position: 0 },
      { id: "3", name: "Cut out soft drinks", target: "No Coke", active: true, position: 0 },
    ],
    entries,
    weeks: 2,
  });
  assert.match(message, /Baseline \(2026-04-23\): waist 116 cm, weight 102\.35 kg\./);
  assert.match(message, /Habits and targets:\n- Cut out soft drinks: No Coke\n- Golf: 3 rounds a week\n\n/);
  assert.doesNotMatch(message, /Old habit/);
  assert.match(message, /logged since baseline: 5\. Next session: B\./);
  assert.match(message, /the last 2 of 3/);
  const rows = message.split("\n").filter((l) => /^2026-/.test(l));
  assert.deepEqual(rows, [
    "2026-10-12 | 111 | 99.2 | — | — | 2 | 0.5 | — | —",
    "2026-10-19 | 110.5 | — | — | — | 1 | — | — | Sore back skipped golf",
  ]);
});

test("a check-in's paragraphs, lists and bold come through", () => {
  const text = "## Waist\nDown **0.5 cm** this week.\nThat's the trend.\n\nFocus:\n- Two strength sessions\n- Golf twice\nAnd sleep.\n\n\n";
  assert.deepEqual(blocks(text), [
    { kind: "p", text: "Waist Down **0.5 cm** this week. That's the trend." },
    { kind: "p", text: "Focus:" },
    { kind: "ul", items: ["Two strength sessions", "Golf twice"] },
    { kind: "p", text: "And sleep." },
  ]);
  assert.deepEqual(boldParts("Down **0.5 cm** this week"), [
    { bold: false, text: "Down " },
    { bold: true, text: "0.5 cm" },
    { bold: false, text: " this week" },
  ]);
});
