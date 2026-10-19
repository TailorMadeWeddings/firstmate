// The Logbook's dates and repeats. Everything is worked out in Sydney wall
// time, so a 4pm Tuesday stays at 4pm when daylight saving starts or ends.
// Pure, so it's testable without Next or a database.

export const TZ = "Australia/Sydney";

// ---------- Sydney wall time ----------

export type Wall = { y: number; m: number; d: number; h: number; min: number };

const partsFormat = new Intl.DateTimeFormat("en-AU", {
  timeZone: TZ,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

/** The Sydney date and time of an instant. */
export function wallOf(date: Date): Wall {
  const p = Object.fromEntries(partsFormat.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute };
}

const asUtc = (w: Wall) => Date.UTC(w.y, w.m - 1, w.d, w.h, w.min);

/** The instant a Sydney date and time happens. */
export function fromWall(w: Wall): Date {
  // Guess with the offset at that moment, then correct once across a DST edge.
  let t = asUtc(w);
  for (let i = 0; i < 2; i++) t = asUtc(w) - (asUtc(wallOf(new Date(t))) - t);
  return new Date(t);
}

/** "2026-10-19" for an instant, in Sydney. */
export const dayKey = (date: Date) => {
  const w = wallOf(date);
  return `${w.y}-${String(w.m).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;
};

/** A calendar day plus n days (no time zone involved). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Midnight in Sydney at the start of a calendar day. */
export const startOfDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return fromWall({ y, m, d, h: 0, min: 0 });
};

/** Monday of the week a day is in. */
export function weekStart(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(day, -((weekday + 6) % 7));
}

// ---------- repeats ----------
// ponytail: only the RRULEs the event form makes (FREQ + INTERVAL, BYDAY for
// weekly). Swap in an RRULE library if events ever need more.

export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
const DAY_NAMES: Record<Weekday, string> = {
  MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun",
};
const weekdayOf = (day: string): Weekday => WEEKDAYS[(new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7];

export type Repeat = "none" | "daily" | "weekly" | "fortnightly" | "monthly" | "yearly";

/** The RRULE for a repeat choice; weekly and fortnightly default to the first day's weekday. */
export function ruleFor(repeat: Repeat, days: Weekday[], firstDay: string): string | null {
  const byday = (days.length ? WEEKDAYS.filter((d) => days.includes(d)) : [weekdayOf(firstDay)]).join(",");
  switch (repeat) {
    case "daily":
      return "FREQ=DAILY;INTERVAL=1";
    case "weekly":
      return `FREQ=WEEKLY;INTERVAL=1;BYDAY=${byday}`;
    case "fortnightly":
      return `FREQ=WEEKLY;INTERVAL=2;BYDAY=${byday}`;
    case "monthly":
      return "FREQ=MONTHLY;INTERVAL=1";
    case "yearly":
      return "FREQ=YEARLY;INTERVAL=1";
    default:
      return null;
  }
}

type Rule = { freq: string; interval: number; byday: Weekday[] };

function parse(rule: string): Rule {
  const p = Object.fromEntries(rule.split(";").map((x) => x.split("=")));
  return {
    freq: p.FREQ,
    interval: Math.max(1, Number(p.INTERVAL ?? 1)),
    byday: (p.BYDAY ? p.BYDAY.split(",") : []) as Weekday[],
  };
}

/** The form's choice back from an RRULE. */
export function repeatOf(rule: string | null): { repeat: Repeat; days: Weekday[] } {
  if (!rule) return { repeat: "none", days: [] };
  const r = parse(rule);
  const repeat: Repeat =
    r.freq === "DAILY" ? "daily"
    : r.freq === "WEEKLY" ? (r.interval === 2 ? "fortnightly" : "weekly")
    : r.freq === "MONTHLY" ? "monthly"
    : "yearly";
  return { repeat, days: r.byday };
}

/** "Every Tue", "Every 2 weeks on Mon, Wed", "Daily", "Monthly", "Yearly". */
export function describeRepeat(rule: string | null): string | null {
  if (!rule) return null;
  const r = parse(rule);
  const days = r.byday.map((d) => DAY_NAMES[d]).join(", ");
  if (r.freq === "DAILY") return r.interval === 1 ? "Daily" : `Every ${r.interval} days`;
  if (r.freq === "WEEKLY") return r.interval === 1 ? `Every ${days}` : `Every ${r.interval} weeks on ${days}`;
  if (r.freq === "MONTHLY") return r.interval === 1 ? "Monthly" : `Every ${r.interval} months`;
  return r.interval === 1 ? "Yearly" : `Every ${r.interval} years`;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Whether a repeating event happens on a calendar day (the first day always counts). */
function happensOn(rule: Rule, first: string, day: string): boolean {
  const gap = daysBetween(first, day);
  if (gap < 0) return false;
  const [fy, fm, fd] = first.split("-").map(Number);
  const [y, m, d] = day.split("-").map(Number);
  switch (rule.freq) {
    case "DAILY":
      return gap % rule.interval === 0;
    case "WEEKLY": {
      const weeks = Math.floor(daysBetween(weekStart(first), day) / 7);
      const days = rule.byday.length ? rule.byday : [weekdayOf(first)];
      return weeks % rule.interval === 0 && days.includes(weekdayOf(day));
    }
    case "MONTHLY": {
      // Like RFC 5545: a 31st skips the months that don't have one.
      const months = (y - fy) * 12 + (m - fm);
      return months % rule.interval === 0 && d === fd && fd <= daysInMonth(y, m);
    }
    case "YEARLY":
      return (y - fy) % rule.interval === 0 && m === fm && d === fd;
    default:
      return gap === 0;
  }
}

// ---------- occurrences ----------

export type EventRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  recurrence_rule: string | null;
  recurrence_ends_at: string | null;
};

export type ExceptionRow = {
  parent_event_id: string;
  original_start_at: string;
  is_cancelled: boolean;
  title: string | null;
  description: string | null;
  location: string | null;
  start_at: string | null;
  end_at: string | null;
};

export type Occurrence = {
  eventId: string;
  /** When this occurrence was due in the series; identifies it for one-off edits. */
  originalStart: Date;
  start: Date;
  end: Date;
  allDay: boolean;
  title: string;
  description: string | null;
  location: string | null;
  rule: string | null;
};

/**
 * Every occurrence that overlaps [from, to), with one-off changes and
 * cancellations applied, in start order.
 */
export function occurrences(events: EventRow[], exceptions: ExceptionRow[], from: Date, to: Date): Occurrence[] {
  const out: Occurrence[] = [];
  const changes = new Map(exceptions.map((x) => [`${x.parent_event_id}@${Date.parse(x.original_start_at)}`, x]));

  for (const e of events) {
    const start = new Date(e.start_at);
    const length = Date.parse(e.end_at) - start.getTime();
    const firstDay = dayKey(start);
    const wall = wallOf(start);
    const ends = e.recurrence_ends_at ? Date.parse(e.recurrence_ends_at) : Infinity;
    const add = (begin: Date, day: string) => {
      // All-day events keep whole days; timed ones keep their length.
      const end = e.all_day ? startOfDay(addDays(day, Math.max(1, Math.round(length / 86_400_000)))) : new Date(begin.getTime() + length);
      const change = changes.get(`${e.id}@${begin.getTime()}`);
      if (change?.is_cancelled) return;
      const o: Occurrence = {
        eventId: e.id,
        originalStart: begin,
        start: change?.start_at ? new Date(change.start_at) : begin,
        end: change?.end_at ? new Date(change.end_at) : end,
        allDay: e.all_day,
        title: change?.title ?? e.title,
        description: change?.description ?? e.description,
        location: change?.location ?? e.location,
        rule: e.recurrence_rule,
      };
      if (o.end > from && o.start < to) out.push(o);
    };

    if (!e.recurrence_rule) {
      add(start, firstDay);
      continue;
    }
    const rule = parse(e.recurrence_rule);
    // Walk the calendar days from a little before the range (so long events
    // that started earlier still show) to its end.
    const lead = Math.ceil(length / 86_400_000) + 1;
    let day = [firstDay, addDays(dayKey(from), -lead)].sort()[1];
    const last = dayKey(to);
    for (let guard = 0; day <= last && guard < 4000; guard++, day = addDays(day, 1)) {
      if (!happensOn(rule, firstDay, day)) continue;
      const [y, m, d] = day.split("-").map(Number);
      const begin = fromWall({ y, m, d, h: wall.h, min: wall.min });
      if (begin.getTime() >= ends) break;
      add(begin, day);
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime() || a.title.localeCompare(b.title));
}

// ---------- laying out a day ----------

/**
 * Side-by-side columns for events that overlap: each gets a lane, and the
 * number of lanes its overlapping group needs, so the grid can size it.
 */
export function lanes<T extends { start: Date; end: Date }>(items: T[]) {
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());
  const out: { item: T; lane: number; lanes: number }[] = [];
  let group: { item: T; lane: number; lanes: number }[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;
  const close = () => {
    for (const g of group) g.lanes = laneEnds.length;
    out.push(...group);
    group = [];
    laneEnds = [];
  };
  for (const item of sorted) {
    const s = item.start.getTime();
    if (s >= groupEnd) close();
    let lane = laneEnds.findIndex((end) => end <= s);
    if (lane < 0) lane = laneEnds.push(0) - 1;
    laneEnds[lane] = item.end.getTime();
    groupEnd = Math.max(groupEnd, item.end.getTime());
    group.push({ item, lane, lanes: 0 });
  }
  close();
  return out;
}

// ---------- crew colours ----------

/** Default colours, in order: the validated categorical palette from the Ledger charts. */
export const CREW_COLOURS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

/** Ink or white, whichever reads better on a colour (for initials on avatars). */
export function textOn(hex: string): string {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Pick the higher contrast of white (L=1) and ink #1e1b18 (L≈0.012).
  return (1.05 / (l + 0.05)) >= ((l + 0.05) / 0.062) ? "#ffffff" : "#1e1b18";
}
