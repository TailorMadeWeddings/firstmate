import assert from "node:assert/strict";
import { test } from "node:test";
import { checklist, fluThisYear, monthsAfter } from "./immunisation.ts";

test("visits fall due by age, and month-ends land on the month's last day", () => {
  assert.equal(monthsAfter("2024-09-08", 2), "2024-11-08");
  assert.equal(monthsAfter("2024-08-31", 6), "2025-02-28");
  assert.equal(monthsAfter("2024-09-08", 48), "2028-09-08");
});

test("a two-year-old's checklist: done, overdue, due and upcoming", () => {
  const got = checklist("2024-09-08", new Set(["birth", "2m", "4m", "6m", "12m"]), "2026-05-20");
  const by = Object.fromEntries(got.map((v) => [v.key, `${v.status} ${v.due}`]));
  assert.deepEqual(by, {
    birth: "done 2024-09-08",
    "2m": "done 2024-11-08",
    "4m": "done 2025-01-08",
    "6m": "done 2025-03-08",
    "12m": "done 2025-09-08",
    "18m": "overdue 2026-03-08",
    "4y": "upcoming 2028-09-08",
    year7: "upcoming 2037-03-08",
    year10: "upcoming 2040-03-08",
  });
  // Six weeks past due is "due", not yet overdue.
  assert.equal(checklist("2024-09-08", new Set(), "2026-04-19").find((v) => v.key === "18m")!.status, "due");
  // Long past and not entered: probably given, just not recorded here yet.
  assert.equal(checklist("2024-09-08", new Set(), "2026-05-20").find((v) => v.key === "2m")!.status, "unrecorded");
  // School visits are never overdue here.
  assert.equal(checklist("2010-01-01", new Set(), "2026-10-20").find((v) => v.key === "year7")!.status, "due");
});

test("the yearly flu vaccine, from 6 months until 5", () => {
  assert.equal(fluThisYear("2024-09-08", [], "2025-01-01"), null); // under 6 months
  assert.equal(fluThisYear("2024-09-08", [{ vaccine: "Influenza", given_on: "2025-05-01" }], "2026-04-20"), "due"); // last year's
  assert.equal(fluThisYear("2024-09-08", [{ vaccine: "Flu (Vaxigrip)", given_on: "2026-04-01" }], "2026-04-20"), "done");
  assert.equal(fluThisYear("2020-01-01", [], "2026-04-20"), null); // turned 5
});
