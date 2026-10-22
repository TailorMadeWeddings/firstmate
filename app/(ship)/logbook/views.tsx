// The Logbook's three views, after the AI Studio mock-up: the week grid
// (also the day view, with one column), and the agenda list for phones.
import Link from "next/link";
import { ChefHat, ClipboardCheck, Plus } from "lucide-react";
import { type Duty, dueLabel, dutiesOn, personFor } from "@/lib/duties";
import { TZ, addDays, dayKey, describeRepeat, lanes, startOfDay, textOn, wallOf } from "@/lib/logbook";
import { DutyRow } from "../duties/duty-row";
import type { CrewMember, Entry } from "./data";

const FIRST_HOUR = 6;
const LAST_HOUR = 22;

const time = (d: Date) =>
  new Intl.DateTimeFormat("en-AU", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d).replace(" ", "").toLowerCase();

const dayName = (day: string, style: "short" | "long" = "short") =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: style, timeZone: "UTC" });

export const eventHref = (e: Entry) => `/logbook/events/${e.eventId}?at=${encodeURIComponent(e.originalStart.toISOString())}`;

/** An event's card: a link to its page, or just the card when it's from someone's other calendar. */
function EntryLink({ entry, className, style, children }: { entry: Entry; className: string; style?: React.CSSProperties; children: React.ReactNode }) {
  if (entry.fromFeed) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }
  return (
    <Link href={eventHref(entry)} className={className} style={style}>
      {children}
    </Link>
  );
}

/** Initials in each person's colour; the colour is never the only clue. */
export function Avatars({ keys, crew, size = "sm" }: { keys: string[]; crew: CrewMember[]; size?: "sm" | "lg" }) {
  const people = keys.map((k) => crew.find((c) => c.key === k)).filter((c) => c !== undefined);
  return (
    <span className="flex -space-x-1.5">
      {people.map((c) => (
        <span
          key={c.key}
          title={c.name}
          className={`flex shrink-0 items-center justify-center rounded-full border-2 border-background font-bold ${
            size === "lg" ? "size-9 text-sm" : "size-6 text-[10px]"
          }`}
          style={{ background: c.color, color: textOn(c.color) }}
        >
          {c.name.slice(0, 1).toUpperCase()}
        </span>
      ))}
    </span>
  );
}

/** Marks a meal: an event for cooking a recipe. */
function Meal({ big = false }: { big?: boolean }) {
  return <ChefHat className={`mr-1 inline align-[-0.15em] ${big ? "size-4" : "size-3.5"}`} aria-label="Meal:" />;
}

/** The first assignee's colour marks the event; no one assigned is neutral ink. */
const colourOf = (e: Entry, crew: CrewMember[]) => crew.find((c) => c.key === e.assignees[0])?.color ?? "#6b645d";

/** Days across the top, hours down the side, events placed by time. One day = the day view. */
export function TimeGrid({
  days,
  entries,
  duties = [],
  crew,
  big = false,
}: {
  days: string[];
  entries: Entry[];
  /** Open duties, shown on the day they're due (shown only when the Duties toggle is on). */
  duties?: Duty[];
  crew: CrewMember[];
  big?: boolean;
}) {
  const hour = big ? 72 : 56;
  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i);
  const today = dayKey(new Date());
  const now = wallOf(new Date());
  const nowTop = (now.h - FIRST_HOUR + now.min / 60) * hour;
  const single = days.length === 1;

  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
      <div className={single ? "" : "min-w-[70rem]"}>
        {/* Day headers and all-day events */}
        <div className="sticky top-0 z-20 flex border-b bg-card/95 backdrop-blur">
          <div className="w-14 shrink-0 border-r" />
          {days.map((day) => {
            const isToday = day === today;
            const allDay = entries.filter((e) => e.allDay && dayKey(e.start) <= day && day < dayKey(e.end));
            const dayDuties = dutiesOn(day, duties, today);
            return (
              <div key={day} className={`relative flex min-w-0 flex-1 flex-col border-r last:border-r-0 ${isToday ? "bg-primary/[0.04]" : ""}`}>
                {isToday && <span className="absolute inset-x-0 top-0 h-1 bg-primary" aria-hidden />}
                <div className="flex items-start justify-between gap-1 px-2 pb-2 pt-3">
                  <Link href={`/logbook?view=day&date=${day}`} className="flex flex-col">
                    <span
                      className={`text-[11px] font-bold uppercase tracking-[0.3em] ${isToday ? "text-primary dark:text-blue-400" : "text-muted-foreground"}`}
                    >
                      {dayName(day)}
                    </span>
                    <span className={`font-serif font-black italic leading-none ${big ? "text-5xl" : "text-4xl"} ${isToday ? "text-primary dark:text-blue-400" : ""}`}>
                      {Number(day.slice(8))}
                    </span>
                  </Link>
                  <Link
                    href={`/logbook/new?date=${day}`}
                    aria-label={`Add to ${dayName(day, "long")} ${Number(day.slice(8))}`}
                    className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Plus className="size-4" aria-hidden />
                  </Link>
                </div>
                {dayDuties.length > 0 && (
                  <ul className="flex flex-col gap-1 px-1.5 pb-1.5" aria-label="Duties">
                    {dayDuties.map((d) => (
                      <li key={d.id}>
                        <Link
                          href={`/duties/${d.id}`}
                          className={`flex items-center gap-1 rounded-md border border-dashed bg-card px-2 py-0.5 ${big ? "text-base" : "text-xs"} ${d.due_on! < today ? "text-red-600 dark:text-red-400" : ""}`}
                          style={{ borderColor: personFor(d, crew)?.color }}
                        >
                          <ClipboardCheck className="size-3.5 shrink-0" aria-label="Duty:" />
                          <span className="truncate">{d.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {allDay.length > 0 && (
                  <div className="flex flex-col gap-1 px-1.5 pb-1.5">
                    {allDay.map((e) => (
                      <EntryLink
                        key={`${e.eventId}${e.originalStart.getTime()}`}
                        entry={e}
                        className={`truncate rounded-md px-2 py-0.5 font-semibold ${big ? "text-base" : "text-xs"}`}
                        style={{ background: colourOf(e, crew), color: textOn(colourOf(e, crew)) }}
                      >
                        {e.title}
                      </EntryLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Hours */}
        <div className="relative flex" style={{ height: hours.length * hour }}>
          <div className="w-14 shrink-0 border-r">
            {hours.map((h) => (
              <div key={h} className="pr-2 pt-1 text-right font-serif text-xs italic text-muted-foreground" style={{ height: hour }}>
                {h === 12 ? "12pm" : h > 12 ? `${h - 12}pm` : `${h}am`}
              </div>
            ))}
          </div>
          {days.map((day) => {
            const top = startOfDay(day).getTime();
            const timed = entries.filter((e) => !e.allDay && dayKey(e.start) === day);
            return (
              <div key={day} className="relative min-w-0 flex-1 border-r last:border-r-0">
                {hours.map((h) => (
                  <div key={h} className="border-b border-dashed border-border/70" style={{ height: hour }} />
                ))}
                {lanes(timed).map(({ item: e, lane, lanes: n }) => {
                  const startH = (e.start.getTime() - top) / 3_600_000;
                  const endH = Math.min((e.end.getTime() - top) / 3_600_000, LAST_HOUR);
                  const from = Math.max(startH, FIRST_HOUR);
                  const colour = colourOf(e, crew);
                  return (
                    <EntryLink
                      key={`${e.eventId}${e.originalStart.getTime()}`}
                      entry={e}
                      className="group absolute overflow-hidden rounded-xl border-l-[6px] p-2 shadow-sm transition hover:z-10 hover:shadow-md"
                      style={{
                        top: (from - FIRST_HOUR) * hour + 1,
                        height: Math.max((endH - from) * hour - 2, big ? 36 : 28),
                        left: `calc(${(lane / n) * 100}% + 3px)`,
                        width: `calc(${100 / n}% - 6px)`,
                        borderLeftColor: colour,
                        background: `color-mix(in srgb, ${colour} 14%, hsl(var(--card)))`,
                      }}
                    >
                      <span className={`block font-bold leading-tight ${big ? "text-base" : "text-sm"} line-clamp-2`}>
                        {e.recipeId && <Meal big={big} />}
                        {e.title}
                      </span>
                      {/* Time and who share a line, so even an hour-long card shows both. */}
                      <span className="flex items-center justify-between gap-1">
                        <span className={`min-w-0 truncate text-muted-foreground ${big ? "text-sm" : "text-[11px]"}`}>
                          {time(e.start)}–{time(e.end)}
                        </span>
                        <Avatars keys={e.assignees} crew={crew} />
                      </span>
                      {/* Notes go last, so a short card clips them rather than the time. */}
                      {e.description && (
                        <span className={`mt-1 block whitespace-pre-line text-muted-foreground ${big ? "text-sm" : "text-[11px]"} line-clamp-3`}>
                          {e.description}
                        </span>
                      )}
                    </EntryLink>
                  );
                })}
                {day === today && now.h >= FIRST_HOUR && now.h < LAST_HOUR && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: nowTop }} aria-hidden>
                    <span className="-ml-1.5 size-3 rounded-full bg-primary" />
                    <span className="h-0.5 flex-1 bg-primary" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Upcoming events as a list, grouped by day: the phone's view. */
export function Agenda({ from, days, entries, duties = [], crew }: { from: string; days: number; entries: Entry[]; duties?: Duty[]; crew: CrewMember[] }) {
  const today = dayKey(new Date());
  const list = Array.from({ length: days }, (_, i) => addDays(from, i))
    .map((day) => ({
      day,
      items: entries.filter((e) => (e.allDay ? dayKey(e.start) <= day && day < dayKey(e.end) : dayKey(e.start) === day)),
      duties: dutiesOn(day, duties, today),
    }))
    .filter((d) => d.items.length + d.duties.length > 0);

  if (list.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center">
        <p className="font-serif text-2xl italic text-muted-foreground">Calm seas: nothing planned.</p>
        <Link href={`/logbook/new?date=${from}`} className="mt-3 inline-block text-sm font-semibold text-primary hover:underline dark:text-blue-400">
          Add an event
        </Link>
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-6">
      {list.map(({ day, items, duties: dayDuties }) => (
        <li key={day} className="flex flex-col gap-2">
          <h2 className="flex items-baseline gap-2">
            <span className={`font-serif text-2xl font-black italic ${day === today ? "text-primary dark:text-blue-400" : ""}`}>
              {day === today ? "Today" : day === addDays(today, 1) ? "Tomorrow" : dayName(day, "long")}
            </span>
            <span className="text-sm text-muted-foreground">
              {new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "long", timeZone: "UTC" })}
            </span>
          </h2>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {items.map((e) => {
              const colour = colourOf(e, crew);
              return (
                <li key={`${e.eventId}${e.originalStart.getTime()}`}>
                  <EntryLink entry={e} className={`flex items-center gap-3 px-4 py-3 ${e.fromFeed ? "" : "hover:bg-muted"}`}>
                    <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: colour }} aria-hidden />
                    <span className="w-16 shrink-0 text-sm tabular-nums text-muted-foreground">
                      {e.allDay ? "All day" : time(e.start)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {e.recipeId && <Meal />}
                        {e.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[e.location, describeRepeat(e.rule)].filter(Boolean).join(" · ")}
                      </span>
                      {e.description && <span className="block line-clamp-2 text-xs text-muted-foreground">{e.description}</span>}
                    </span>
                    <Avatars keys={e.assignees} crew={crew} />
                  </EntryLink>
                </li>
              );
            })}
            {dayDuties.map((d) => (
              <DutyRow key={d.id} duty={d} due={d.due_on! < day ? dueLabel(d.due_on!, today) : null} overdue={d.due_on! < today} person={personFor(d, crew)} />
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
