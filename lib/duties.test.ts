import assert from "node:assert/strict";
import { test } from "node:test";
import { type Duty, dueLabel, groupOf, grouped, nextDue } from "./duties.ts";

const TODAY = "2026-10-20"; // a Tuesday

test("repeating duties move to their next date, never back into the past", () => {
  assert.equal(nextDue("2026-10-20", "weekly", TODAY), "2026-10-27"); // done on the day
  assert.equal(nextDue("2026-10-21", "weekly", TODAY), "2026-10-28"); // done a day early
  assert.equal(nextDue("2026-10-06", "weekly", TODAY), "2026-10-27"); // two weeks late: no catch-up
  assert.equal(nextDue("2026-10-20", "daily", TODAY), "2026-10-21");
  assert.equal(nextDue("2026-10-13", "fortnightly", TODAY), "2026-10-27");
  assert.equal(nextDue("2026-01-31", "monthly", "2026-01-31"), "2026-02-28");
  assert.equal(nextDue("2026-12-15", "monthly", TODAY), "2027-01-15");
  assert.equal(nextDue("2028-02-29", "yearly", "2028-02-29"), "2029-02-28");
});

test("due dates group and read naturally", () => {
  assert.equal(groupOf(null, TODAY), "someday");
  assert.equal(groupOf("2026-10-19", TODAY), "overdue");
  assert.equal(groupOf("2026-10-20", TODAY), "today");
  assert.equal(groupOf("2026-10-21", TODAY), "tomorrow");
  assert.equal(groupOf("2026-10-26", TODAY), "week");
  assert.equal(groupOf("2026-10-27", TODAY), "later");

  assert.equal(dueLabel("2026-10-20", TODAY), "Today");
  assert.equal(dueLabel("2026-10-21", TODAY), "Tomorrow");
  assert.equal(dueLabel("2026-10-19", TODAY), "Yesterday");
  assert.equal(dueLabel("2026-10-17", TODAY), "3 days late");
  assert.equal(dueLabel("2026-10-23", TODAY), "Friday");
  assert.equal(dueLabel("2026-11-12", TODAY), "12 Nov");
  assert.equal(dueLabel("2027-02-03", TODAY), "3 Feb 2027");
});

test("open duties come grouped, important first, then soonest", () => {
  const duty = (title: string, due_on: string | null, important = false): Duty => ({
    id: title, title, notes: null, category: null, due_on, repeat: null, important, assignee: null,
    done_at: null, created_by: "x", created_at: `2026-10-01T00:00:0${title.length % 10}Z`,
  });
  const got = grouped(
    [duty("Rego", "2026-11-30"), duty("Bins", "2026-10-20"), duty("Card for Nan", "2026-10-20", true), duty("Clean gutters", null), duty("Tax", "2026-10-01")],
    TODAY,
  ).map((g) => [g.group, g.duties.map((d) => d.title)]);
  assert.deepEqual(got, [
    ["overdue", ["Tax"]],
    ["today", ["Card for Nan", "Bins"]],
    ["later", ["Rego"]],
    ["someday", ["Clean gutters"]],
  ]);
});
