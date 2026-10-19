import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type EventRow,
  type ExceptionRow,
  CREW_COLOURS,
  addDays,
  dayKey,
  describeRepeat,
  fromWall,
  lanes,
  occurrences,
  repeatOf,
  ruleFor,
  startOfDay,
  textOn,
  wallOf,
  weekStart,
} from "./logbook.ts";

const event = (over: Partial<EventRow>): EventRow => ({
  id: "e",
  title: "Swimming",
  description: null,
  location: null,
  start_at: "2026-09-29T06:00:00Z", // Tue 29 Sep, 4pm in Sydney (AEST, +10)
  end_at: "2026-09-29T07:00:00Z",
  all_day: false,
  recurrence_rule: null,
  recurrence_ends_at: null,
  ...over,
});
const starts = (os: { start: Date }[]) => os.map((o) => o.start.toISOString());

test("Sydney wall time, both sides of daylight saving", () => {
  // 4 Oct 2026: clocks go forward at 2am. Before is +10, after is +11.
  assert.equal(fromWall({ y: 2026, m: 9, d: 29, h: 16, min: 0 }).toISOString(), "2026-09-29T06:00:00.000Z");
  assert.equal(fromWall({ y: 2026, m: 10, d: 6, h: 16, min: 0 }).toISOString(), "2026-10-06T05:00:00.000Z");
  assert.deepEqual(wallOf(new Date("2026-10-06T05:00:00Z")), { y: 2026, m: 10, d: 6, h: 16, min: 0 });
  assert.equal(dayKey(new Date("2026-10-19T13:30:00Z")), "2026-10-20"); // 12:30am Tuesday in Sydney
  assert.equal(startOfDay("2026-10-20").toISOString(), "2026-10-19T13:00:00.000Z");
  assert.equal(weekStart("2026-10-25"), "2026-10-19"); // Sunday → Monday before
  assert.equal(weekStart("2026-10-19"), "2026-10-19");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("a weekly 4pm stays at 4pm across daylight saving", () => {
  const swim = event({ recurrence_rule: ruleFor("weekly", [], "2026-09-29") });
  const got = occurrences([swim], [], new Date("2026-09-28T00:00:00Z"), new Date("2026-10-14T00:00:00Z"));
  assert.deepEqual(starts(got), ["2026-09-29T06:00:00.000Z", "2026-10-06T05:00:00.000Z", "2026-10-13T05:00:00.000Z"]);
  assert.ok(got.every((o) => o.end.getTime() - o.start.getTime() === 3_600_000));
});

test("fortnightly on chosen days, until an end", () => {
  const rule = ruleFor("fortnightly", ["WE", "MO"], "2026-10-19");
  assert.equal(rule, "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE");
  const e = event({
    start_at: "2026-10-18T22:00:00Z", // Mon 19 Oct, 9am
    end_at: "2026-10-18T23:00:00Z",
    recurrence_rule: rule,
    recurrence_ends_at: "2026-11-15T22:00:00Z", // 16 Nov 9am (AEDT, +11): that one and later don't happen
  });
  const days = occurrences([e], [], new Date("2026-10-01T00:00:00Z"), new Date("2026-12-31T00:00:00Z")).map((o) =>
    dayKey(o.start),
  );
  assert.deepEqual(days, ["2026-10-19", "2026-10-21", "2026-11-02", "2026-11-04"]);
});

test("monthly on the 31st skips short months; yearly keeps its date", () => {
  const e = event({ start_at: "2026-01-30T22:00:00Z", end_at: "2026-01-30T23:00:00Z", recurrence_rule: "FREQ=MONTHLY;INTERVAL=1" }); // 31 Jan 9am
  const days = occurrences([e], [], new Date("2026-01-01T00:00:00Z"), new Date("2026-06-01T00:00:00Z")).map((o) => dayKey(o.start));
  assert.deepEqual(days, ["2026-01-31", "2026-03-31", "2026-05-31"]);
  const birthday = event({ start_at: "2026-08-07T14:00:00Z", end_at: "2026-08-08T14:00:00Z", all_day: true, recurrence_rule: "FREQ=YEARLY;INTERVAL=1" });
  const got = occurrences([birthday], [], new Date("2027-08-01T00:00:00Z"), new Date("2027-08-31T00:00:00Z"));
  assert.deepEqual(got.map((o) => [dayKey(o.start), dayKey(new Date(o.end.getTime() - 1))]), [["2027-08-08", "2027-08-08"]]);
});

test("one-off changes and cancellations, and events overlapping the range edge", () => {
  const e = event({ recurrence_rule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=TU" });
  const exceptions: ExceptionRow[] = [
    { parent_event_id: "e", original_start_at: "2026-10-06T05:00:00Z", is_cancelled: true, title: null, description: null, location: null, start_at: null, end_at: null },
    { parent_event_id: "e", original_start_at: "2026-10-13T05:00:00Z", is_cancelled: false, title: "Swimming (late)", description: null, location: null, start_at: "2026-10-13T07:00:00Z", end_at: "2026-10-13T08:00:00Z" },
  ];
  const got = occurrences([e], exceptions, new Date("2026-10-05T00:00:00Z"), new Date("2026-10-15T00:00:00Z"));
  assert.deepEqual(got.map((o) => [o.title, o.start.toISOString(), o.originalStart.toISOString()]), [
    ["Swimming (late)", "2026-10-13T07:00:00.000Z", "2026-10-13T05:00:00.000Z"],
  ]);
  // A one-off event that started before the range but runs into it still shows.
  const camp = event({ id: "c", title: "Camp", start_at: "2026-10-03T22:00:00Z", end_at: "2026-10-06T06:00:00Z" });
  assert.deepEqual(occurrences([camp], [], new Date("2026-10-05T00:00:00Z"), new Date("2026-10-06T00:00:00Z")).map((o) => o.title), ["Camp"]);
});

test("repeat choices round-trip and read nicely", () => {
  for (const [repeat, days, text] of [
    ["daily", [], "Daily"],
    ["weekly", ["TU"], "Every Tue"],
    ["fortnightly", ["MO", "WE"], "Every 2 weeks on Mon, Wed"],
    ["monthly", [], "Monthly"],
    ["yearly", [], "Yearly"],
  ] as const) {
    const rule = ruleFor(repeat, [...days], "2026-10-20");
    assert.equal(describeRepeat(rule), text);
    assert.equal(repeatOf(rule).repeat, repeat);
  }
  assert.equal(ruleFor("none", [], "2026-10-20"), null);
  assert.deepEqual(repeatOf(null), { repeat: "none", days: [] });
  assert.equal(ruleFor("weekly", [], "2026-10-20"), "FREQ=WEEKLY;INTERVAL=1;BYDAY=TU");
});

test("overlapping events share a group of lanes; separate ones get the full width", () => {
  const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 20, h, m));
  const items = [
    { id: "a", start: at(9), end: at(10) },
    { id: "b", start: at(9, 30), end: at(11) },
    { id: "c", start: at(10), end: at(10, 30) }, // reuses a's lane
    { id: "d", start: at(12), end: at(13) }, // on its own
  ];
  const got = Object.fromEntries(lanes(items).map((l) => [l.item.id, [l.lane, l.lanes]]));
  assert.deepEqual(got, { a: [0, 2], b: [1, 2], c: [0, 2], d: [0, 1] });
});

test("crew initials read on every default colour", () => {
  assert.equal(textOn("#2a78d6"), "#ffffff");
  assert.equal(textOn("#eda100"), "#1e1b18");
  assert.equal(textOn("#1baf7a"), "#1e1b18");
  assert.equal(textOn("#6250d6"), "#ffffff");
  assert.equal(CREW_COLOURS.length, 8);
});
