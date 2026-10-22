// Calendars in and out of the Logbook as iCalendar (ICS) feeds, one way
// each: someone's other calendar (Google, Outlook, iCloud) read in by its
// secret link, and the Logbook read out by a phone's calendar app.
// Pure, so it's testable without Next or a database.
import ICAL from "ical.js";
import { type Occurrence, addDays, dayKey, fromWall, startOfDay } from "./logbook.ts";

/** How far either side of today feeds are worked out, in and out. */
export const FEED_DAYS_BEFORE = 90;
export const FEED_DAYS_AFTER = 365;

/** The link as https (calendar apps write webcal://), or null if it isn't one the server should fetch. */
export function feedUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim().replace(/^webcals?:\/\//i, "https://"));
  } catch {
    return null;
  }
  // ponytail: names only (no IP addresses or localhost) so a link can't point
  // the server at itself; a name that resolves somewhere private still gets
  // through. Resolve and check the address if feeds ever come from strangers.
  const host = url.hostname;
  const local = host === "localhost" || host.endsWith(".localhost") || host.startsWith("[") || /^[\d.]+$/.test(host);
  return url.protocol === "https:" && !local && url.href.length <= 2000 ? url.href : null;
}

export type FeedEvent = {
  title: string;
  location: string | null;
  description: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
};

const MAX_EVENTS = 5000;
const clip = (s: string | null | undefined, n: number) => (s ? s.trim().slice(0, n) || null : null);

/**
 * The instant an ICS time happens. Dates and times with no zone (or one the
 * feed didn't describe) are taken as Sydney wall time, as the Logbook's are.
 */
function instant(t: ICAL.Time): Date {
  if (t.isDate || t.zone === ICAL.Timezone.localTimezone) {
    return fromWall({ y: t.year, m: t.month, d: t.day, h: t.hour, min: t.minute });
  }
  return t.toJSDate();
}

/** Every event in an ICS file overlapping [from, to): repeats worked out, one-off changes and cancellations applied. */
export function readFeed(ics: string, from: Date, to: Date): FeedEvent[] {
  const root = new ICAL.Component(ICAL.parse(ics));
  for (const tz of root.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(tz);

  // Changed occurrences share their series' UID and say which one they replace.
  const series = new Map<string, ICAL.Event>();
  const changes: ICAL.Component[] = [];
  root.getAllSubcomponents("vevent").forEach((v, i) => {
    if (v.hasProperty("recurrence-id")) changes.push(v);
    else series.set(String(v.getFirstPropertyValue("uid") ?? i), new ICAL.Event(v));
  });
  for (const c of changes) {
    const parent = series.get(String(c.getFirstPropertyValue("uid")));
    if (parent) parent.relateException(c);
    else series.set(`${series.size}:orphan`, new ICAL.Event(c));
  }

  const out: FeedEvent[] = [];
  const add = (start: ICAL.Time, end: ICAL.Time, e: ICAL.Event) => {
    if (e.component.getFirstPropertyValue("status") === "CANCELLED") return;
    const s = instant(start);
    let en = instant(end);
    if (start.isDate && en <= s) en = startOfDay(addDays(dayKey(s), 1));
    if (en <= from || s >= to) return;
    out.push({
      title: clip(e.summary, 200) ?? "Busy",
      location: clip(e.location, 300),
      description: clip(e.description, 2000),
      start_at: s.toISOString(),
      end_at: (en < s ? s : en).toISOString(),
      all_day: start.isDate,
    });
  };

  for (const e of series.values()) {
    if (!e.isRecurring()) {
      add(e.startDate, e.endDate, e);
      continue;
    }
    // ponytail: walks each series from its first occurrence; a decades-old
    // daily repeat costs a few thousand steps, capped by the guard.
    const it = e.iterator();
    for (let next = it.next(), guard = 0; next && guard < 50_000 && out.length < MAX_EVENTS; next = it.next(), guard++) {
      const o = e.getOccurrenceDetails(next);
      if (instant(o.startDate) >= to) break;
      add(o.startDate, o.endDate, o.item);
    }
  }
  return out.slice(0, MAX_EVENTS);
}

/** The Logbook as an ICS file: one event per occurrence, so every calendar app reads repeats and one-off changes the same. */
export function writeFeed(name: string, items: Occurrence[], now = new Date()): string {
  const cal = new ICAL.Component("vcalendar");
  cal.addPropertyWithValue("version", "2.0");
  cal.addPropertyWithValue("prodid", "-//First Mate//Logbook//EN");
  cal.addPropertyWithValue("x-wr-calname", name);
  cal.addPropertyWithValue("x-published-ttl", "PT1H");
  const date = (day: string) => ICAL.Time.fromData({ year: +day.slice(0, 4), month: +day.slice(5, 7), day: +day.slice(8), isDate: true });
  for (const o of items) {
    const v = new ICAL.Component("vevent");
    v.addPropertyWithValue("uid", `${o.eventId}-${o.originalStart.getTime()}@firstmate`);
    v.addPropertyWithValue("dtstamp", ICAL.Time.fromJSDate(now, true));
    v.addPropertyWithValue("dtstart", o.allDay ? date(dayKey(o.start)) : ICAL.Time.fromJSDate(o.start, true));
    v.addPropertyWithValue("dtend", o.allDay ? date(dayKey(o.end)) : ICAL.Time.fromJSDate(o.end, true));
    v.addPropertyWithValue("summary", o.title);
    if (o.location) v.addPropertyWithValue("location", o.location);
    if (o.description) v.addPropertyWithValue("description", o.description);
    cal.addSubcomponent(v);
  }
  return cal.toString();
}
