import assert from "node:assert/strict";
import { test } from "node:test";
import { type ProgramLog, amount, dayNames, formatMinutes, isTrainingDay, minutesIn, programState, workoutFor } from "./exercise.ts";

test("hours add up, and read naturally", () => {
  const sessions = [
    { starts_at: "2026-10-20T08:00:00Z", minutes: 90 },
    { starts_at: "2026-10-22T08:00:00Z", minutes: 90 },
    { starts_at: "2026-10-27T08:00:00Z", minutes: 45 },
  ];
  assert.equal(minutesIn(sessions, new Date("2026-10-19T13:00:00Z"), new Date("2026-10-26T13:00:00Z")), 180);
  assert.equal(formatMinutes(45), "45 min");
  assert.equal(formatMinutes(180), "3 h");
  assert.equal(formatMinutes(195), "3 h 15 min");
});

test("workouts step up through a block from your tested max", () => {
  assert.deepEqual(workoutFor(12, 0, "reps"), { sets: [5, 5, 5, 5], lastAtLeast: 6, restSeconds: 60 });
  assert.deepEqual(workoutFor(12, 5, "reps"), { sets: [8, 8, 8, 8], lastAtLeast: 9, restSeconds: 90 });
  assert.deepEqual(workoutFor(40, 3, "reps"), { sets: [22, 24, 22, 22], lastAtLeast: 26, restSeconds: 60 });
  // Time-based: rounded to 5 seconds, never under 5.
  assert.deepEqual(workoutFor(60, 0, "seconds"), { sets: [25, 25, 25, 25], lastAtLeast: 30, restSeconds: 60 });
  assert.deepEqual(workoutFor(2, 0, "reps").sets, [1, 1, 1, 1]);
});

test("a program: test, six workouts, re-test, until the goal", () => {
  const log = (kind: "test" | "workout", n: number, at: string): ProgramLog =>
    kind === "test"
      ? { kind, result: n, sets: null, done_on: at.slice(0, 10), created_at: at }
      : { kind, result: null, sets: [n, n, n, n, n], done_on: at.slice(0, 10), created_at: at };
  assert.deepEqual(programState([], 100, "reps").next, { kind: "test" });

  const started = [log("test", 12, "2026-10-01T00:00:00Z"), log("workout", 5, "2026-10-03T00:00:00Z")];
  const s = programState(started, 100, "reps");
  assert.equal(s.max, 12);
  assert.equal(s.block, 1);
  assert.deepEqual(s.next, { kind: "workout", index: 1, workout: workoutFor(12, 1, "reps") });

  const sixDone = [log("test", 12, "2026-10-01T00:00:00Z"), ...[3, 5, 8, 10, 12, 15].map((d) => log("workout", 6, `2026-10-${String(d).padStart(2, "0")}T00:00:00Z`))];
  assert.deepEqual(programState(sixDone, 100, "reps").next, { kind: "test" });

  const retested = [...sixDone, log("test", 20, "2026-10-17T00:00:00Z")];
  const r = programState(retested, 100, "reps");
  assert.deepEqual({ max: r.max, best: r.best, block: r.block, reached: r.reached }, { max: 20, best: 20, block: 2, reached: false });
  assert.equal(programState([log("test", 101, "2026-12-01T00:00:00Z")], 100, "reps").reached, true);
});

test("training days, day names and amounts", () => {
  assert.equal(isTrainingDay(["MO", "WE", "FR"], "2026-10-21"), true); // a Wednesday
  assert.equal(isTrainingDay(["MO", "WE", "FR"], "2026-10-20"), false);
  assert.equal(dayNames(["FR", "MO", "WE"]), "Mon, Wed and Fri");
  assert.equal(amount(12, "reps"), "12");
  assert.equal(amount(45, "seconds"), "45 s");
  assert.equal(amount(90, "seconds"), "1 min 30 s");
});
