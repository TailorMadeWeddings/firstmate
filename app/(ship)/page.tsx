import { ChefHat, ClipboardCheck, Dumbbell } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { dueLabel, personFor } from "@/lib/duties";
import { isTrainingDay, programState } from "@/lib/exercise";
import { TZ, addDays, dayKey, startOfDay } from "@/lib/logbook";
import { canSeeConstitution, canSeeLedger, currentMember } from "@/lib/players";
import { sectionIcons, visibleSections } from "@/lib/sections";
import { createClient } from "@/lib/supabase/server";
import { tickDaily, tickSlot } from "./constitution/exercise/actions";
import { loadActivities, loadDaily, loadPrograms } from "./constitution/exercise/data";
import { Tick } from "./constitution/exercise/tick";
import { loadDuties } from "./duties/data";
import { DutyRow } from "./duties/duty-row";
import { loadCrew, loadEntries } from "./logbook/data";

export default function Home() {
  return (
    <div className="flex flex-col gap-10">
      <Suspense fallback={<div className="h-28" />}>
        <Masthead />
      </Suspense>
      <div className="grid gap-4 lg:grid-cols-2">
        <Suspense>
          <Tonight />
        </Suspense>
        <Suspense>
          <DueToday />
        </Suspense>
        <Suspense>
          <TrainingToday />
        </Suspense>
      </div>
      <Suspense>
        <Sections />
      </Suspense>
      <Link href="/helm" className="self-start text-sm text-muted-foreground hover:underline">
        Kitchen screen settings
      </Link>
    </div>
  );
}

/** The mock-up's editorial header: the household's name, and today in italic. */
async function Masthead() {
  const member = await currentMember();
  const supabase = await createClient();
  const { data } = await supabase.from("households").select("name").eq("id", member.householdId).maybeSingle();
  const today = new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Australia/Sydney",
  }).format(new Date());
  return (
    <header className="flex flex-col gap-1 border-b pb-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">First Mate</p>
      <h1 className="text-4xl md:text-6xl">{data?.name ?? "Home"}</h1>
      <p className="font-serif text-2xl font-light italic text-muted-foreground md:text-3xl">{today}</p>
    </header>
  );
}

async function Sections() {
  const member = await currentMember();
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {visibleSections({ ledger: await canSeeLedger(member), constitution: await canSeeConstitution(member) }).map((s) => {
        const Icon = sectionIcons[s.slug];
        return (
          <li key={s.slug}>
            <Link
              href={`/${s.slug}`}
              className="group flex h-full flex-col gap-3 rounded-2xl border bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <Icon aria-hidden className="size-7 text-primary" />
              <span className="font-serif text-2xl font-black tracking-tight">{s.name}</span>
              <span className="text-sm text-muted-foreground">{s.blurb}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Today's meals from the Logbook, with a button straight into cooking mode. */
async function Tonight() {
  const member = await currentMember();
  if (member.role === "guest") return null;
  const today = dayKey(new Date());
  const meals = (await loadEntries(startOfDay(today), startOfDay(addDays(today, 1)))).filter((e) => e.recipeId && !e.allDay);
  if (meals.length === 0) return null;
  const time = (d: Date) => new Intl.DateTimeFormat("en-AU", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d);
  return (
    <section aria-labelledby="tonight" className="flex flex-col gap-3 rounded-2xl border bg-card p-6 shadow-sm">
      <h2 id="tonight" className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
        On the menu today
      </h2>
      <ul className="flex flex-col gap-3">
        {meals.map((m) => (
          <li key={`${m.eventId}${m.originalStart.getTime()}`} className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="min-w-0 flex-1">
              <Link href={`/galley/${m.recipeId}`} className="font-serif text-3xl font-black hover:underline">
                {m.title}
              </Link>
              <span className="ml-3 text-sm text-muted-foreground">{time(m.start)}</span>
            </span>
            <Button asChild size="lg">
              <Link href={`/galley/${m.recipeId}/cook`}>
                <ChefHat aria-hidden /> Cook
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Duties due today, and any left over from before, ready to tick off. */
async function DueToday() {
  const member = await currentMember();
  if (member.role === "guest") return null;
  const today = dayKey(new Date());
  const [{ open }, crew] = await Promise.all([loadDuties(), loadCrew(member.householdId)]);
  const due = open
    .filter((d) => d.due_on && d.due_on <= today)
    .sort((a, b) => Number(b.important) - Number(a.important) || a.due_on!.localeCompare(b.due_on!));
  if (due.length === 0) return null;
  const SHOWN = 6;
  return (
    <section aria-labelledby="due-today" className="flex flex-col gap-2 rounded-2xl border bg-card p-6 shadow-sm">
      <h2 id="due-today" className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
        <span className="flex items-center gap-2">
          <ClipboardCheck className="size-4" aria-hidden /> Due today
        </span>
        <Link href="/duties" className="normal-case tracking-normal text-primary hover:underline dark:text-blue-400">
          {due.length > SHOWN ? `All ${due.length}` : "All duties"} →
        </Link>
      </h2>
      <ul className="-mx-4 divide-y">
        {due.slice(0, SHOWN).map((d) => (
          <DutyRow key={d.id} duty={d} due={d.due_on! < today ? dueLabel(d.due_on!, today) : null} overdue={d.due_on! < today} person={personFor(d, crew)} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Your own training for today: scheduled sessions, a program workout if it's
 * a training day, and the daily checklist. Private, so never on the kitchen
 * screen (canSeeConstitution says no there).
 */
async function TrainingToday() {
  const member = await currentMember();
  if (!(await canSeeConstitution(member))) return null;
  const today = dayKey(new Date());
  const [{ slots }, programs, daily] = await Promise.all([loadActivities(`p:${member.id}`, today), loadPrograms(), loadDaily(today)]);
  const todays = slots.filter((s) => dayKey(s.start) === today);
  const due = programs.filter((p) => p.active && isTrainingDay(p.weekdays, today) && !p.logs.some((l) => l.done_on === today));
  if (todays.length + due.length + daily.length === 0) return null;
  const time = (d: Date) => new Intl.DateTimeFormat("en-AU", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d).replace(" ", "").toLowerCase();
  return (
    <section aria-labelledby="training" className="flex flex-col gap-2 rounded-2xl border bg-card p-6 shadow-sm">
      <h2 id="training" className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
        <span className="flex items-center gap-2">
          <Dumbbell className="size-4" aria-hidden /> Your training today
        </span>
        <Link href="/constitution/exercise" className="normal-case tracking-normal text-primary hover:underline dark:text-blue-400">
          Exercise →
        </Link>
      </h2>
      <ul className="flex flex-col divide-y">
        {todays.map((s) => (
          <li key={`${s.scheduleId}${s.originalStart.getTime()}`} className="flex items-center gap-3 py-2">
            <Tick
              done={s.session !== null}
              undo={false}
              label={`${s.activity.name} at ${time(s.start)}: ${s.session ? "done" : "not done"}`}
              toggle={tickSlot.bind(null, s.activity.id, s.scheduleId, s.originalStart.toISOString(), Math.round((s.end.getTime() - s.start.getTime()) / 60000) || s.activity.minutes)}
            />
            <span className="flex-1 font-medium">{s.activity.name}</span>
            <span className="text-sm text-muted-foreground">{time(s.start)}</span>
          </li>
        ))}
        {due.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2">
            <Dumbbell className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <Link href={`/constitution/exercise/program/${p.id}`} className="flex-1 font-medium hover:underline">
              {p.name}: {programState(p.logs, p.goal, p.unit).next.kind === "test" ? "test day" : "workout"}
            </Link>
          </li>
        ))}
        {daily.map((d) => (
          <li key={d.id} className="flex items-center gap-3 py-2">
            <Tick done={d.done} label={`${d.name}: ${d.done ? "done" : "not done"}`} toggle={tickDaily.bind(null, d.id)} />
            <span className={d.done ? "text-muted-foreground line-through" : ""}>{d.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
