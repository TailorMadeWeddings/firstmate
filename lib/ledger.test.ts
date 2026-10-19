import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type Category,
  addMonths,
  daysUntil,
  forEntry,
  monthly,
  nextDue,
  pace,
  parseAmount,
  period,
  ruleFor,
  scheduleLabel,
  scheduleOf,
  signed,
  spendingByCategory,
  totals,
  withChildren,
} from "./ledger.ts";

test("amounts parse exactly, and only sensible ones", () => {
  assert.equal(parseAmount("12"), "12");
  assert.equal(parseAmount(" $1,234.50 "), "1234.50");
  assert.equal(parseAmount("0.1"), "0.1");
  for (const bad of ["", "abc", "1.234", "-5", "0", "1e5", "12345678901"]) {
    assert.equal(parseAmount(bad), null, bad);
  }
  assert.equal(parseAmount("-250.00", true), "-250.00");
  assert.equal(parseAmount("0", true), "0");
  assert.equal(signed("84.20", "expense"), "-84.20");
  assert.equal(signed("1500", "income"), "1500");
});

test("entry forms list recent categories first and hide archived ones", () => {
  const c = (id: string, name: string, extra: Partial<Category> = {}): Category => ({
    id, name, type: "expense", parent_category_id: null, archived_at: null, color: null, icon: null, ...extra,
  });
  const all = [
    c("t", "Transport"),
    c("f", "Fuel", { parent_category_id: "t" }),
    c("g", "Groceries"),
    c("a", "Alcohol", { archived_at: "2026-10-01" }),
    c("e", "Eating Out"),
  ];
  const names = forEntry(all, ["g", null, "f", "g"]).map((x) => x.id);
  assert.deepEqual(names, ["g", "f", "e", "t"]);
});

test("bill schedules land on the right dates", () => {
  const monthly31 = ruleFor("months", 1, "2026-01-31");
  assert.equal(monthly31, "FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=31");
  // The 31st becomes the last day of short months, then goes back to the 31st.
  assert.equal(nextDue("2026-01-31", monthly31), "2026-02-28");
  assert.equal(nextDue("2026-02-28", monthly31), "2026-03-31");
  assert.equal(nextDue("2026-12-31", monthly31), "2027-01-31");
  const quarterly = ruleFor("months", 3, "2026-11-15");
  assert.equal(nextDue("2026-11-15", quarterly), "2027-02-15");
  assert.equal(scheduleLabel(quarterly), "Quarterly");
  const fortnightly = ruleFor("weeks", 2, "2026-12-24");
  assert.equal(nextDue("2026-12-24", fortnightly), "2027-01-07");
  assert.equal(scheduleLabel(fortnightly), "Fortnightly");
  const leap = ruleFor("years", 1, "2028-02-29");
  assert.equal(nextDue("2028-02-29", leap), "2029-02-28");
  assert.equal(nextDue("2031-02-28", leap), "2032-02-29");
  assert.deepEqual(scheduleOf(ruleFor("years", 2, "2026-07-01")), { unit: "years", interval: 2 });
  assert.equal(scheduleLabel(ruleFor("months", 2, "2026-07-01")), "Every 2 months");
  assert.equal(daysUntil("2026-10-17", "2026-10-19"), -2);
});

test("goal pace", () => {
  const goal = { target_amount: 1200, target_date: "2027-01-01", created_at: "2026-01-01T00:00:00Z" };
  // Halfway through the year with half saved is on pace.
  const half = pace(goal, 600, "2026-07-02");
  assert.equal(half.percent, 50);
  assert.equal(half.ahead, true);
  assert.equal(pace(goal, 400, "2026-07-02").ahead, false);
  assert.equal(pace(goal, 1300, "2026-07-02").percent, 100);
  assert.equal(pace(goal, 1300, "2026-07-02").perMonth, null);
  assert.equal(pace({ ...goal, target_date: null }, 300).perMonth, null);
  // 600 to go over ~6 months is about 100 a month.
  assert.ok(Math.abs(pace(goal, 600, "2026-07-02").perMonth! - 100) < 2);
});

test("report periods", () => {
  assert.equal(addMonths("2026-11", 2), "2027-01");
  assert.equal(addMonths("2026-01", -1), "2025-12");
  const now = "2026-10-19";
  assert.deepEqual(period(undefined, undefined, now), {
    from: "2026-10", to: "2026-10", months: ["2026-10"], previous: { from: "2026-09", to: "2026-09" },
  });
  const q = period("2026-08", "2026-10", now);
  assert.deepEqual(q.months, ["2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(q.previous, { from: "2026-05", to: "2026-07" });
  assert.deepEqual(period("2026-10", "2026-08", now).months, ["2026-08", "2026-09", "2026-10"]);
  assert.equal(period("garbage", "2026-13", now).from, "2026-10");
  assert.equal(period("2026-02", undefined, now).to, "2026-02");
});

test("report totals, category roll-up and monthly series", () => {
  const cats = [
    { id: "t", name: "Transport", type: "expense", parent_category_id: null },
    { id: "f", name: "Fuel", type: "expense", parent_category_id: "t" },
    { id: "g", name: "Groceries", type: "expense", parent_category_id: null },
  ] as Category[];
  const rows = [
    { month: "2026-09-01", category_id: "g", money_in: 0, money_out: 400 },
    { month: "2026-10-01", category_id: "g", money_in: 0.1, money_out: 120.1 },
    { month: "2026-10-01", category_id: "f", money_in: 0.2, money_out: 90 },
    { month: "2026-10-01", category_id: "t", money_in: 0, money_out: 40 },
    { month: "2026-10-01", category_id: null, money_in: 3000, money_out: 12.5 },
  ];
  assert.deepEqual(totals(rows, "2026-10", "2026-10"), { moneyIn: 3000.3, moneyOut: 262.6, net: 2737.7 });
  assert.deepEqual(spendingByCategory(rows, cats, "2026-10", "2026-10"), [
    { id: "t", amount: 130 },
    { id: "g", amount: 120.1 },
    { id: null, amount: 12.5 },
  ]);
  assert.deepEqual(
    monthly(rows, ["2026-08", "2026-09"]).map((m) => m.moneyOut),
    [0, 400],
  );
  assert.deepEqual(withChildren("t", cats), ["t", "f"]);
});
