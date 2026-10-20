import type { Metadata } from "next";
import { CalendarClock, Dumbbell, ListChecks, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ACTIVITY_IDEAS, amount, dayNames, formatMinutes, isTrainingDay, minutesIn, programState } from "@/lib/exercise";
import { TZ, addDays, dayKey, describeRepeat, startOfDay, weekStart } from "@/lib/logbook";
import { type PersonKey, isPersonKey } from "@/lib/medical";
import { currentMedicalMember } from "@/lib/players";
import { ConstitutionTabs } from "../tabs";
import { addActivity, addDailyItem, deleteDailyItem, tickDaily, tickSlot } from "./actions";
import { type Program, type Slot, loadActivities, loadDaily, loadPeople, loadPrograms } from "./data";
import { Tick } from "./tick";

export const metadata: Metadata = { title: "Exercise · Constitution · First Mate" };

type Search = { person?: string };

export default function ExercisePage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Exercise searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const time = (d: Date) => new Intl.DateTimeFormat("en-AU", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d).replace(" ", "").toLowerCase();
const day = (d: Date) => new Intl.DateTimeFormat("en-AU", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(d);

async function Exercise({ searchParams }: { searchParams: Promise<Search> }) {
  const member = await currentMedicalMember();
  const search = await searchParams;
  const people = await loadPeople(member);
  const person: PersonKey = (isPersonKey(search.person) && people.some((p) => p.key === search.person) ? search.person : null) ?? `p:${member.id}`;
  const subject = people.find((p) => p.key === person);
  const self = person === `p:${member.id}`;
  const today = dayKey(new Date());
  const [{ activities, schedules, sessions, slots }, programs, daily] = await Promise.all([
    loadActivities(person, today),
    self ? loadPrograms() : Promise.resolve([] as Program[]),
    self ? loadDaily(today) : Promise.resolve([]),
  ]);
  const todaysSlots = slots.filter((s) => dayKey(s.start) === today);
  const weekFrom = startOfDay(weekStart(today));
  const monthFrom = startOfDay(`${today.slice(0, 8)}01`);
  const yearFrom = startOfDay(`${today.slice(0, 5)}01-01`);
  const end = startOfDay(addDays(today, 1));
  const dueToday = programs.filter((p) => p.active && isTrainingDay(p.weekdays, today) && !p.logs.some((l) => l.done_on === today));

  return (
    <>
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Constitution</p>
          <h1 className="text-4xl">Exercise</h1>
          <p className="text-sm text-muted-foreground">
            {self ? "Only you can see your exercise." : `Kept by the Captains.`} Scheduled sessions show on the Logbook by the activity&apos;s name.
          </p>
        </div>
        <ConstitutionTabs current="exercise" fitness={member.role === "owner"} />
      </header>

      {people.length > 1 && (
        <nav aria-label="Who" className="flex flex-wrap gap-2">
          {people.map((p) => (
            <Link
              key={p.key}
              href={`/constitution/exercise?person=${encodeURIComponent(p.key)}`}
              aria-current={p.key === person ? "page" : undefined}
              className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-medium hover:bg-muted aria-[current=page]:border-foreground aria-[current=page]:bg-foreground aria-[current=page]:text-background"
            >
              <span className="size-3 rounded-full" style={{ background: p.color }} aria-hidden />
              {p.key === `p:${member.id}` ? "You" : p.name}
            </Link>
          ))}
        </nav>
      )}

      {self && (daily.length > 0 || dueToday.length > 0 || todaysSlots.length > 0) && (
        <section aria-labelledby="today" className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
          <h2 id="today" className="font-serif text-2xl font-black">
            Today
          </h2>
          <ul className="flex flex-col divide-y">
            {todaysSlots.map((s) => (
              <SlotRow key={`${s.scheduleId}${s.originalStart.getTime()}`} slot={s} />
            ))}
            {dueToday.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <Dumbbell className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <Link href={`/constitution/exercise/program/${p.id}`} className="flex-1 font-medium hover:underline">
                  {p.name}: {programState(p.logs, p.goal, p.unit).next.kind === "test" ? "test day" : "today's workout"}
                </Link>
              </li>
            ))}
            {daily.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2.5">
                <Tick done={d.done} label={`${d.name}: ${d.done ? "done" : "not done"}`} toggle={tickDaily.bind(null, d.id)} />
                <span className={d.done ? "text-muted-foreground line-through" : ""}>{d.name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {slots.length > 0 && (
        <section aria-labelledby="week" className="flex flex-col gap-3">
          <h2 id="week" className="flex items-center gap-2 font-serif text-2xl font-black">
            <CalendarClock className="size-5" aria-hidden /> This week
          </h2>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card px-4">
            {slots.map((s) => (
              <SlotRow key={`${s.scheduleId}${s.originalStart.getTime()}`} slot={s} withDay />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="activities" className="flex flex-col gap-3">
        <h2 id="activities" className="font-serif text-2xl font-black">
          {self ? "Your activities" : `${subject?.name ?? "Their"} activities`}
        </h2>
        {activities.length === 0 && <p className="text-sm text-muted-foreground">None yet. Add one below: aikido, golf, the gym, swimming…</p>}
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {activities.map((a) => {
            const mine = sessions.filter((s) => s.activity_id === a.id);
            const last = mine[0];
            return (
              <li key={a.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/constitution/exercise/activity/${a.id}`} className="font-serif text-xl font-black hover:underline">
                    {a.name}
                  </Link>
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/constitution/exercise/session/new?activity=${a.id}`}>
                      <Plus aria-hidden /> Log
                    </Link>
                  </Button>
                </div>
                <ul className="flex flex-col gap-0.5 text-sm text-muted-foreground">
                  {schedules.filter((s) => s.activity_id === a.id).map((s) => (
                    <li key={s.id}>
                      {describeRepeat(s.event.recurrence_rule)}, {time(new Date(s.event.start_at))}
                    </li>
                  ))}
                </ul>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  {(
                    [
                      ["This week", weekFrom],
                      ["This month", monthFrom],
                      ["This year", yearFrom],
                    ] as const
                  ).map(([label, from]) => (
                    <div key={label} className="rounded-lg bg-muted/60 px-2 py-1.5">
                      <dt className="text-[11px] text-muted-foreground">{label}</dt>
                      <dd className="text-sm font-semibold tabular-nums">{formatMinutes(minutesIn(mine, from, end))}</dd>
                    </div>
                  ))}
                </dl>
                {last && (
                  <p className="text-xs text-muted-foreground">
                    Last: {day(new Date(last.starts_at))}, {formatMinutes(last.minutes)}
                    {last.distance_km !== null && `, ${last.distance_km} km`}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <ActionForm action={addActivity.bind(null, person)} className="flex flex-wrap items-end gap-2 rounded-2xl border border-dashed p-3">
          <Input name="name" list="activity-ideas" placeholder="Add an activity" aria-label="Activity" required maxLength={60} className="h-10 min-w-40 flex-1" />
          <datalist id="activity-ideas">
            {ACTIVITY_IDEAS.map((i) => (
              <option key={i} value={i} />
            ))}
          </datalist>
          <Input name="minutes" type="number" inputMode="numeric" min={5} max={600} defaultValue={60} aria-label="Usual length in minutes" className="h-10 w-24" />
          <Button>Add</Button>
        </ActionForm>
      </section>

      {self && (
        <section aria-labelledby="programs" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="programs" className="flex items-center gap-2 font-serif text-2xl font-black">
              <Dumbbell className="size-5" aria-hidden /> Programs
            </h2>
            <Button asChild size="sm" variant="secondary">
              <Link href="/constitution/exercise/program/new">
                <Plus aria-hidden /> Start one
              </Link>
            </Button>
          </div>
          {programs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Step-by-step plans like 100 push-ups: test what you can do, then train from it a few days a week.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {programs.map((p) => {
                const s = programState(p.logs, p.goal, p.unit);
                return (
                  <li key={p.id}>
                    <Link href={`/constitution/exercise/program/${p.id}`} className="flex flex-col gap-1 rounded-2xl border bg-card p-4 hover:bg-muted/50">
                      <span className="font-serif text-xl font-black">{p.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {dayNames(p.weekdays)}
                        {!p.active && " · paused"}
                      </span>
                      <span className="text-sm">
                        {s.reached
                          ? `Goal reached: ${amount(s.best!, p.unit)}`
                          : s.max === null
                            ? "Starts with a test"
                            : `Best ${amount(s.best!, p.unit)} of ${amount(p.goal, p.unit)} · next: ${s.next.kind === "test" ? "a test" : `workout ${s.next.index + 1} of 6`}`}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {self && (
        <section aria-labelledby="daily" className="flex flex-col gap-3">
          <h2 id="daily" className="flex items-center gap-2 font-serif text-2xl font-black">
            <ListChecks className="size-5" aria-hidden /> Every day
          </h2>
          <p className="text-sm text-muted-foreground">Home exercises and stretches to tick off each day. They show under Today, here and on your home screen.</p>
          {daily.length > 0 && (
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
              {daily.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="flex-1">{d.name}</span>
                  <ActionForm action={deleteDailyItem.bind(null, d.id)} confirm={`Stop “${d.name}”?`}>
                    <Button size="sm" variant="ghost" aria-label={`Remove ${d.name}`}>
                      <Trash2 aria-hidden />
                    </Button>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={addDailyItem} className="flex gap-2">
            <Input name="name" placeholder="Hamstring stretch, 2 minutes" aria-label="Daily exercise or stretch" required maxLength={80} className="h-10 flex-1" />
            <Button>Add</Button>
          </ActionForm>
        </section>
      )}
    </>
  );
}

/** A scheduled session: tick it off in one tap, then add details if you like. */
function SlotRow({ slot: s, withDay = false }: { slot: Slot; withDay?: boolean }) {
  const length = Math.round((s.end.getTime() - s.start.getTime()) / 60000) || s.activity.minutes;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <Tick
        done={s.session !== null}
        undo={false}
        label={`${s.activity.name}, ${day(s.start)} ${time(s.start)}: ${s.session ? "done" : "not done"}`}
        toggle={tickSlot.bind(null, s.activity.id, s.scheduleId, s.originalStart.toISOString(), length)}
      />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{s.activity.name}</span>
        <span className="block text-xs text-muted-foreground">
          {withDay ? `${day(s.start)}, ` : ""}
          {time(s.start)} · {formatMinutes(length)}
        </span>
      </span>
      {s.session && (
        <Link href={`/constitution/exercise/session/${s.session.id}`} className="text-sm font-semibold text-primary hover:underline dark:text-blue-400">
          Details
        </Link>
      )}
    </li>
  );
}
