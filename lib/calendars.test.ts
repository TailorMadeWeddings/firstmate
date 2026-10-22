import assert from "node:assert/strict";
import { test } from "node:test";
import { feedUrl, readFeed, writeFeed } from "./calendars.ts";
import { type EventRow, occurrences, startOfDay } from "./logbook.ts";

// Like a Google Calendar secret address: its own zone, a weekly repeat with
// one moved and one skipped, a cancelled one-off, an all-day event, a UTC one.
const ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTIMEZONE
TZID:Australia/Sydney
BEGIN:STANDARD
DTSTART:19700405T030000
RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU
TZOFFSETFROM:+1100
TZOFFSETTO:+1000
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19701004T020000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=1SU
TZOFFSETFROM:+1000
TZOFFSETTO:+1100
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:standup
DTSTART;TZID=Australia/Sydney:20260928T090000
DTEND;TZID=Australia/Sydney:20260928T091500
RRULE:FREQ=WEEKLY;BYDAY=MO
EXDATE;TZID=Australia/Sydney:20261012T090000
SUMMARY:Standup
END:VEVENT
BEGIN:VEVENT
UID:standup
RECURRENCE-ID;TZID=Australia/Sydney:20261005T090000
DTSTART;TZID=Australia/Sydney:20261005T100000
DTEND;TZID=Australia/Sydney:20261005T101500
SUMMARY:Standup (late)
END:VEVENT
BEGIN:VEVENT
UID:offsite
DTSTART;VALUE=DATE:20261007
DTEND;VALUE=DATE:20261009
SUMMARY:Offsite
LOCATION:Bowral
END:VEVENT
BEGIN:VEVENT
UID:gone
DTSTART:20261006T000000Z
DTEND:20261006T010000Z
STATUS:CANCELLED
SUMMARY:Cancelled
END:VEVENT
BEGIN:VEVENT
UID:call
DTSTART:20261006T230000Z
DTEND:20261007T000000Z
SUMMARY:Call with London
END:VEVENT
END:VCALENDAR`;

test("readFeed: repeats, moves, skips, cancellations, all-day and zones", () => {
  const got = readFeed(ICS, startOfDay("2026-10-01"), startOfDay("2026-10-20"));
  assert.deepEqual(
    got.map((e) => [e.title, e.start_at, e.end_at, e.all_day]).sort((a, b) => String(a[1]).localeCompare(String(b[1]))),
    [
      // 9am Sydney is 11pm UTC the day before; daylight saving starts 4 Oct (+11).
      ["Standup (late)", "2026-10-04T23:00:00.000Z", "2026-10-04T23:15:00.000Z", false],
      ["Offsite", "2026-10-06T13:00:00.000Z", "2026-10-08T13:00:00.000Z", true],
      ["Call with London", "2026-10-06T23:00:00.000Z", "2026-10-07T00:00:00.000Z", false],
      // 12 Oct skipped; the 28 Sep one is before the window.
      ["Standup", "2026-10-18T22:00:00.000Z", "2026-10-18T22:15:00.000Z", false],
    ],
  );
  assert.equal(got.find((e) => e.title === "Offsite")?.location, "Bowral");
});

test("readFeed: no zone and no end means Sydney time, and a one-day all-day event", () => {
  const got = readFeed(
    "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:x\nDTSTART:20261020T090000\nEND:VEVENT\nBEGIN:VEVENT\nUID:y\nDTSTART;VALUE=DATE:20261021\nEND:VEVENT\nEND:VCALENDAR",
    startOfDay("2026-10-01"),
    startOfDay("2026-11-01"),
  );
  assert.deepEqual(
    got.map((e) => [e.title, e.start_at, e.end_at]),
    [
      ["Busy", "2026-10-19T22:00:00.000Z", "2026-10-19T22:00:00.000Z"],
      ["Busy", "2026-10-20T13:00:00.000Z", "2026-10-21T13:00:00.000Z"],
    ],
  );
});

test("feedUrl: https and webcal links only, never the server itself", () => {
  assert.equal(feedUrl(" webcal://p01-caldav.icloud.com/published/2/abc "), "https://p01-caldav.icloud.com/published/2/abc");
  assert.equal(feedUrl("https://calendar.google.com/calendar/ical/x/private-y/basic.ics"), "https://calendar.google.com/calendar/ical/x/private-y/basic.ics");
  for (const bad of ["http://example.com/a.ics", "https://localhost/a.ics", "https://127.0.0.1/a", "https://[::1]/a", "file:///etc/passwd", "nonsense"]) {
    assert.equal(feedUrl(bad), null, bad);
  }
});

test("writeFeed: one event per occurrence, all-day as dates, round-trips through readFeed", () => {
  const row: EventRow = {
    id: "e1",
    title: "Swimming, lane 3",
    description: "Bring goggles\nand a towel",
    location: null,
    start_at: "2026-09-29T06:00:00Z", // Tue 4pm Sydney
    end_at: "2026-09-29T07:00:00Z",
    all_day: false,
    recurrence_rule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=TU",
    recurrence_ends_at: null,
  };
  const trip: EventRow = { ...row, id: "e2", title: "Camping", description: null, all_day: true, recurrence_rule: null, start_at: startOfDay("2026-10-02").toISOString(), end_at: startOfDay("2026-10-04").toISOString() };
  const from = startOfDay("2026-09-28");
  const to = startOfDay("2026-10-12");
  const ics = writeFeed("Kidd family", occurrences([row, trip], [], from, to), new Date("2026-10-21T00:00:00Z"));
  assert.match(ics, /X-WR-CALNAME:Kidd family/);
  assert.match(ics, /SUMMARY:Swimming\\, lane 3/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261002\r\nDTEND;VALUE=DATE:20261004/);
  assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, 3);
  assert.deepEqual(
    readFeed(ics, from, to).map((e) => [e.title, e.start_at, e.all_day]),
    [
      ["Swimming, lane 3", "2026-09-29T06:00:00.000Z", false],
      ["Camping", "2026-10-01T14:00:00.000Z", true],
      ["Swimming, lane 3", "2026-10-06T05:00:00.000Z", false],
    ],
  );
});
