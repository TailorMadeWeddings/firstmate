import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, ClipboardCheck, Plus } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { after } from "next/server";
import { Suspense } from "react";
import { LiveRefresh } from "@/components/live-refresh";
import { Button } from "@/components/ui/button";
import { LOGBOOK_DUTIES_COOKIE } from "@/lib/duties";
import { addDays, dayKey, startOfDay, weekStart } from "@/lib/logbook";
import { kitchenState } from "@/lib/players";
import { loadDuties } from "../duties/data";
import { toggleLogbookDuties } from "./actions";
import { currentCrew, loadCrew, loadEntries } from "./data";
import { refreshFeeds } from "./feeds";
import { Agenda, Avatars, TimeGrid } from "./views";

export const metadata: Metadata = { title: "Logbook · First Mate" };

type View = "week" | "day" | "agenda";
type Search = { view?: string; date?: string };

const AGENDA_DAYS = 30;
const TABLES = ["events", "event_assignees", "event_exceptions"];

export default function LogbookPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Logbook searchParams={searchParams} />
    </Suspense>
  );
}

const pretty = (day: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", { ...opts, timeZone: "UTC" });

async function Logbook({ searchParams }: { searchParams: Promise<Search> }) {
  const member = await currentCrew();
  const search = await searchParams;
  const today = dayKey(new Date());
  const date = search.date && /^\d{4}-\d{2}-\d{2}$/.test(search.date) ? search.date : today;
  // No view chosen: the agenda on phones, the week on anything bigger.
  const chosen = (["week", "day", "agenda"] as const).find((v) => v === search.view);
  const monday = weekStart(date);
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const first = chosen === "day" ? date : chosen === "agenda" ? date : monday;
  const last =
    chosen === "day" ? addDays(date, 1) : chosen === "week" ? addDays(monday, 7) : chosen === "agenda" ? addDays(date, AGENDA_DAYS) : [addDays(monday, 7), addDays(date, AGENDA_DAYS)].sort()[1];
  const showDuties = (await cookies()).get(LOGBOOK_DUTIES_COOKIE)?.value === "1";
  // The crew's other calendars catch up once this page has gone out, ready for the next look.
  after(() => refreshFeeds(member.householdId));
  const [crew, entries, { kitchen }, duties] = await Promise.all([
    loadCrew(member.householdId),
    loadEntries(startOfDay([first, date].sort()[0]), startOfDay(last)),
    kitchenState(member),
    showDuties ? loadDuties().then((d) => d.open) : [],
  ]);

  const step = chosen === "day" ? 1 : chosen === "agenda" ? AGENDA_DAYS : 7;
  const link = (d: string, v: View | undefined = chosen) => `/logbook?${new URLSearchParams({ ...(v ? { view: v } : {}), date: d })}`;
  const title =
    chosen === "day"
      ? pretty(date, { weekday: "long", day: "numeric", month: "long" })
      : chosen === "agenda"
        ? `From ${pretty(date, { day: "numeric", month: "long" })}`
        : `${pretty(monday, { day: "numeric", month: "short" })} – ${pretty(addDays(monday, 6), { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="flex flex-col gap-6">
      <LiveRefresh channel="logbook" tables={showDuties ? [...TABLES, "duties"] : TABLES} />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Logbook</p>
          <h1 className="text-3xl md:text-4xl">{title}</h1>
        </div>
        <Button asChild size={kitchen ? "lg" : "default"}>
          <Link href={`/logbook/new?date=${chosen === "day" ? date : today}`}>
            <Plus aria-hidden /> New event
          </Link>
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg border bg-card">
          <Link href={link(addDays(date, -step))} aria-label="Earlier" className="p-2 hover:bg-muted">
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <Link href={link(today)} className="border-x px-3 py-1.5 text-sm font-semibold hover:bg-muted">
            Today
          </Link>
          <Link href={link(addDays(date, step))} aria-label="Later" className="p-2 hover:bg-muted">
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>
        <nav aria-label="View" className="flex rounded-lg border bg-card p-0.5 text-sm">
          {(["week", "day", "agenda"] as const).map((v) => (
            <Link
              key={v}
              href={link(date, v)}
              aria-current={chosen === v ? "page" : undefined}
              className="rounded-md px-3 py-1 capitalize text-muted-foreground hover:text-foreground aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
            >
              {v}
            </Link>
          ))}
        </nav>
        <form action={toggleLogbookDuties}>
          <button
            aria-pressed={showDuties}
            className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          >
            <ClipboardCheck className="size-4" aria-hidden /> Duties
          </button>
        </form>
        <Link href="/crew" className="ml-auto flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-muted">
          <Avatars keys={crew.map((c) => c.key)} crew={crew} />
          <span className="text-muted-foreground">Crew</span>
        </Link>
      </div>

      {chosen === "week" && <TimeGrid days={week} entries={entries} duties={duties} crew={crew} big={kitchen} />}
      {chosen === "day" && <TimeGrid days={[date]} entries={entries} duties={duties} crew={crew} big={kitchen} />}
      {chosen === "agenda" && <Agenda from={date} days={AGENDA_DAYS} entries={entries} duties={duties} crew={crew} />}
      {!chosen && (
        <>
          <div className="md:hidden">
            <Agenda from={date} days={AGENDA_DAYS} entries={entries} duties={duties} crew={crew} />
          </div>
          <div className="hidden md:block">
            <TimeGrid days={week} entries={entries} duties={duties} crew={crew} big={kitchen} />
          </div>
        </>
      )}
    </div>
  );
}
