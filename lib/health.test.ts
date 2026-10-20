import assert from "node:assert/strict";
import { test } from "node:test";
import { hashKey, readHealthDays } from "./health.ts";

const TODAY = "2026-10-20";

test("a Shortcut's day reads as today, numbers or text alike", () => {
  assert.deepEqual(readHealthDays({ steps: "8,432", resting_hr: 58.4, avg_hr: "71.6 count/min", active_kcal: "", exercise_minutes: 32 }, TODAY), [
    { day: TODAY, steps: 8432, resting_hr: 58, avg_hr: 72, active_kcal: null, exercise_minutes: 32 },
  ]);
  assert.deepEqual(readHealthDays({ active_kj: 2092 }, TODAY), [
    { day: TODAY, steps: null, resting_hr: null, avg_hr: null, active_kcal: 500, exercise_minutes: null },
  ]);
});

test("several days at once, the last for a day winning", () => {
  const got = readHealthDays([{ day: "2026-10-19", steps: 1 }, { day: "2026-10-19T23:59:00+11:00", steps: 2 }, { steps: 3 }], TODAY);
  assert.deepEqual(Array.isArray(got) && got.map((d) => [d.day, d.steps]), [["2026-10-19", 2], [TODAY, 3]]);
});

test("nonsense is turned away with a reason", () => {
  for (const bad of [[], "steps", { steps: "lots" }, { steps: -5 }, { resting_hr: 400 }, { day: "2026-02-30" }, { day: "2027-01-01" }, { day: "2024-01-01" }, [null]]) {
    assert.equal(typeof readHealthDays(bad, TODAY), "string", JSON.stringify(bad));
  }
});

test("keys are kept as sha256", () => {
  assert.equal(hashKey("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
