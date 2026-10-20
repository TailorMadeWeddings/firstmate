import assert from "node:assert/strict";
import { test } from "node:test";
import { addMonths, ageOn, bookSlots, fieldsFor, growth, kindergartenYear, ordinal, pageName, periodProblem, sealed } from "./voyage.ts";

test("voyage: dates", () => {
  assert.equal(addMonths("2022-08-05", 1), "2022-09-05");
  assert.equal(addMonths("2022-01-31", 1), "2022-02-28");
  assert.equal(addMonths("2023-12-15", 1), "2024-01-15");
  assert.equal(addMonths("2022-08-05", 24), "2024-08-05");
  assert.equal(ageOn("2022-08-05", "2026-08-04"), 3);
  assert.equal(ageOn("2022-08-05", "2026-08-05"), 4);
  // Born by 31 July: Kindergarten the year they turn 5; after, the year after.
  assert.equal(kindergartenYear("2022-07-31"), 2027);
  assert.equal(kindergartenYear("2022-08-05"), 2028);
});

test("voyage: a book has the months, birthdays and school years reached so far", () => {
  assert.deepEqual(bookSlots("2022-08-05", "2022-10-05"), { months: [1, 2, 3], years: [], school: [] });
  const theo = bookSlots("2022-08-05", "2026-10-20");
  assert.equal(theo.months.length, 12);
  assert.deepEqual(theo.years, [1, 2, 3, 4]);
  assert.deepEqual(theo.school, []);
  // A grown-up's book runs all the way through.
  const lucy = bookSlots("1991-03-20", "2026-10-20");
  assert.equal(lucy.years.length, 35);
  assert.deepEqual(lucy.school, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  // Not born yet, or no birthday: only the one-off pages and collections.
  assert.deepEqual(bookSlots("2027-01-01", "2026-10-20"), { months: [], years: [], school: [] });
  assert.deepEqual(bookSlots(null, "2026-10-20"), { months: [], years: [], school: [] });
});

test("voyage: page names and periods", () => {
  assert.equal(pageName("month", 3), "Third month");
  assert.equal(pageName("year", 7), "Age 7");
  assert.equal(pageName("birthday", 1), "1st birthday");
  assert.equal(pageName("school", 0), "Kindergarten");
  assert.equal(pageName("school", 4), "Year 4");
  assert.equal(pageName("snapshot", 2022), "2022 in the world");
  assert.equal(pageName("first", null, "First steps"), "First steps");
  assert.equal(pageName("name", 0), "My name");
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 111].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "111th"]);
  assert.equal(periodProblem("month", 12), null);
  assert.ok(periodProblem("month", 13));
  assert.ok(periodProblem("name", 1));
  assert.ok(periodProblem("first", 0));
  assert.equal(periodProblem("first", null), null);
  assert.ok(periodProblem("year", null));
});

test("voyage: each year's page asks what suits that age", () => {
  const names = (age: number) => fieldsFor("year", age).map((f) => f.name);
  assert.ok(names(2).includes("toys"));
  assert.ok(names(8).includes("grow"));
  assert.ok(names(15).includes("milestones"));
  assert.ok(names(30).includes("goals"));
  assert.ok(!names(30).includes("weight"));
});

test("voyage: growth comes from the birth details, months and years", () => {
  const points = growth(
    [
      { template: "year", period: 1, occurred_on: null, fields: { weight: "14", height: "" } },
      { template: "birth", period: 0, occurred_on: null, fields: { weight: "3.62", height: "48.5" } },
      { template: "month", period: 2, occurred_on: null, fields: { weight: "5.2", height: "59.5" } },
      { template: "first", period: null, occurred_on: "2023-01-01", fields: { weight: "99" } },
    ],
    "2022-08-05",
  );
  assert.deepEqual(points.weight, [
    { date: "2022-08-05", value: 3.62 },
    { date: "2022-10-05", value: 5.2 },
    { date: "2023-08-05", value: 14 },
  ]);
  assert.deepEqual(points.height.map((p) => p.value), [48.5, 59.5]);
});

test("voyage: letters stay folded until their day", () => {
  assert.equal(sealed({ open_on: "2040-08-05" }, "2026-10-20"), true);
  assert.equal(sealed({ open_on: "2026-10-20" }, "2026-10-20"), false);
  assert.equal(sealed({}, "2026-10-20"), false);
});
