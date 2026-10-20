import type { Metadata } from "next";
import { PlayCircle, Undo2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { StayAwake } from "@/components/stay-awake";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { amount, dayNames, prescription } from "@/lib/exercise";
import { dayKey } from "@/lib/logbook";
import { currentMedicalMember } from "@/lib/players";
import { deleteRoutine, logRoutine, undoRoutineLog } from "../../actions";
import { type RoutineLog, loadRoutines } from "../../data";

export const metadata: Metadata = { title: "Routine · Exercise · First Mate" };

type Props = { params: Promise<{ id: string }> };

export default function RoutinePage(props: Props) {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <RoutineView {...props} />
      </Suspense>
    </div>
  );
}

const onDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const area = "w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

/** "8 · 8 · 7 per side @ 6 kg". */
const didLine = (d: RoutineLog["done"][number]) =>
  `${d.reps.map((n) => (d.rep_unit === "seconds" ? amount(n, "seconds") : n)).join(" · ")}${d.rep_unit === "per_side" ? " per side" : ""}${d.load ? ` @ ${d.load}` : ""}`;

async function RoutineView({ params }: Props) {
  await currentMedicalMember();
  const { id } = await params;
  const routine = (await loadRoutines()).find((r) => r.id === id);
  if (!routine) notFound();
  const doneToday = routine.logs.some((l) => l.done_on === dayKey(new Date()));
  const video = routine.link && /youtu|vimeo|tiktok|instagram/i.test(routine.link);

  return (
    <>
      <StayAwake />
      <Link href="/constitution/exercise" className="text-sm text-muted-foreground hover:underline">
        ← Exercise
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl">{routine.name}</h1>
        <p className="text-sm text-muted-foreground">
          {[routine.category, routine.weekdays.length > 0 && dayNames(routine.weekdays), routine.rest_seconds !== null && `rest ${amount(routine.rest_seconds, "seconds")} between sets`]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {routine.description && <p>{routine.description}</p>}
        {routine.link && (
          <Button asChild variant="secondary" className="self-start">
            <a href={routine.link} target="_blank" rel="noreferrer">
              <PlayCircle aria-hidden /> {video ? "Watch the video" : "Open the link"}
            </a>
          </Button>
        )}
      </header>

      {doneToday && (
        <p className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
          Done today. Nice work.
        </p>
      )}

      {routine.warm_up && (
        <section aria-labelledby="warm-up" className="flex flex-col gap-1 rounded-2xl border bg-card p-5">
          <h2 id="warm-up" className="font-semibold">
            Warm-up
          </h2>
          <p className="text-muted-foreground">{routine.warm_up}</p>
        </section>
      )}

      <ActionForm action={logRoutine.bind(null, id)} className="flex flex-col gap-4">
        <ol className="flex flex-col gap-3">
          {routine.exercises.map((e) => (
            // Ticking an exercise greys it out, to keep your place; it isn't saved.
            <li key={e.position} className="flex flex-col gap-3 rounded-2xl border bg-card p-4 transition-opacity has-[.place:checked]:opacity-50">
              <label className="flex items-start gap-3">
                <input type="checkbox" className="place mt-1 size-6 shrink-0 accent-primary" aria-label={`${e.name} done`} />
                <span className="flex flex-col">
                  <span className="text-lg font-semibold">
                    {e.position}. {e.name}
                  </span>
                  <span className="text-sm">
                    {prescription(e.sets, e.reps, e.rep_unit)}
                    {e.load && <span className="text-muted-foreground"> · {e.load}</span>}
                  </span>
                  {e.cue && <span className="text-sm italic text-muted-foreground">{e.cue}</span>}
                </span>
              </label>
              <div className="flex flex-wrap items-end gap-2">
                {Array.from({ length: e.sets }, (_, i) => (
                  <div key={i} className="grid gap-1 text-center">
                    <Label htmlFor={`reps-${e.position}-${i}`} className="text-xs text-muted-foreground">
                      Set {i + 1}
                    </Label>
                    <Input
                      id={`reps-${e.position}-${i}`}
                      name={`reps_${e.position}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      defaultValue={e.reps}
                      className="h-12 w-16 px-1 text-center text-xl font-semibold"
                    />
                  </div>
                ))}
                <div className="grid min-w-32 flex-1 gap-1">
                  <Label htmlFor={`load-${e.position}`} className="text-xs text-muted-foreground">
                    Load
                  </Label>
                  <Input id={`load-${e.position}`} name={`load_${e.position}`} defaultValue={e.load ?? ""} maxLength={60} className="h-12" />
                </div>
              </div>
            </li>
          ))}
        </ol>
        <div className="grid gap-1">
          <Label htmlFor="notes">Notes (optional)</Label>
          <textarea id="notes" name="notes" rows={2} maxLength={2000} placeholder="Felt easy; go up a weight next week" className={area} />
        </div>
        <p className="text-xs text-muted-foreground">Change any number to what you actually did, then log it.</p>
        <Button size="lg" className="h-12 self-start">
          Done, log it
        </Button>
      </ActionForm>

      {routine.progression && (
        <section aria-labelledby="progression" className="flex flex-col gap-1">
          <h2 id="progression" className="font-semibold">
            How it steps up
          </h2>
          <p className="text-sm text-muted-foreground">{routine.progression}</p>
        </section>
      )}

      {routine.logs.length > 0 && (
        <section aria-labelledby="log" className="flex flex-col gap-3">
          <h2 id="log" className="font-serif text-2xl font-black">
            So far
          </h2>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {routine.logs.map((l, i) => (
              <li key={l.id} className="flex items-start gap-3 px-4 py-2.5">
                <details className="flex-1">
                  <summary className="cursor-pointer">
                    {onDay(l.done_on)}
                    {l.notes && <span className="text-muted-foreground"> · {l.notes}</span>}
                  </summary>
                  <ul className="mt-2 flex flex-col gap-0.5 text-sm">
                    {l.done.map((d, j) => (
                      <li key={j}>
                        {d.name}: <span className="tabular-nums text-muted-foreground">{didLine(d)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
                {i === 0 && (
                  <ActionForm action={undoRoutineLog.bind(null, l.id)} confirm="Undo this one?">
                    <Button size="sm" variant="ghost" aria-label="Undo">
                      <Undo2 aria-hidden />
                    </Button>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="rounded-2xl border bg-card">
        <summary className="cursor-pointer px-5 py-3 font-semibold">Settings</summary>
        <div className="flex flex-col gap-3 border-t p-5">
          <p className="text-sm text-muted-foreground">To change this routine, ask Claude (it has First Mate&apos;s connector).</p>
          <ActionForm action={deleteRoutine.bind(null, id)} confirm={`Delete ${routine.name} and its history?`}>
            <Button variant="outline" className="text-red-600">
              Delete routine
            </Button>
          </ActionForm>
        </div>
      </details>
    </>
  );
}
