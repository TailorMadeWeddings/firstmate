import type { Metadata } from "next";
import { Undo2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WORKOUTS_PER_BLOCK, amount, dayNames, isTrainingDay, programState } from "@/lib/exercise";
import { dayKey } from "@/lib/logbook";
import { currentMedicalMember } from "@/lib/players";
import { deleteProgram, logProgram, saveProgram, undoProgramLog } from "../../actions";
import { loadPrograms } from "../../data";
import { ProgramFields } from "../../program-fields";

export const metadata: Metadata = { title: "Program · Exercise · First Mate" };

type Props = { params: Promise<{ id: string }> };

export default function ProgramPage(props: Props) {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <ProgramView {...props} />
      </Suspense>
    </div>
  );
}

const onDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

async function ProgramView({ params }: Props) {
  await currentMedicalMember();
  const { id } = await params;
  const program = (await loadPrograms()).find((p) => p.id === id);
  if (!program) notFound();
  const today = dayKey(new Date());
  const s = programState(program.logs, program.goal, program.unit);
  const doneToday = program.logs.some((l) => l.done_on === today);
  const trainingDay = isTrainingDay(program.weekdays, today);
  const history = [...program.logs].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const unitWord = program.unit === "reps" ? program.exercise.toLowerCase() : "seconds";

  return (
    <>
      <Link href="/constitution/exercise" className="text-sm text-muted-foreground hover:underline">
        ← Exercise
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-4xl">{program.name}</h1>
        <p className="text-sm text-muted-foreground">
          {dayNames(program.weekdays)} · goal {amount(program.goal, program.unit)} in one go
          {s.best !== null && ` · best so far ${amount(s.best, program.unit)}`}
        </p>
      </header>

      {s.reached && (
        <p className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
          Goal reached: {amount(s.best!, program.unit)} in one go. Keep it up with the same workouts, or set a new goal below.
        </p>
      )}

      <section aria-labelledby="next" className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
        <h2 id="next" className="font-serif text-2xl font-black">
          {s.next.kind === "test" ? (s.max === null ? "First, a test" : "Test day") : `Workout ${s.next.index + 1} of ${WORKOUTS_PER_BLOCK}`}
        </h2>
        {doneToday ? (
          <p className="text-muted-foreground">Done for today. Next one on your next training day ({dayNames(program.weekdays)}).</p>
        ) : (
          <>
            {!trainingDay && <p className="text-sm text-muted-foreground">Today isn&apos;t one of your training days, but you can do it now if you like.</p>}
            {s.next.kind === "test" ? (
              <ActionForm action={logProgram.bind(null, id, "test")} className="flex flex-col gap-3">
                <p>
                  Do as many {unitWord} as you can in one go, with good form. {program.unit === "seconds" ? "Hold as long as you can." : "Stop when your form goes."}
                </p>
                <div className="flex items-end gap-2">
                  <div className="grid gap-1">
                    <Label htmlFor="result">{program.unit === "reps" ? "How many" : "Seconds held"}</Label>
                    <Input id="result" name="result" type="number" inputMode="numeric" min={0} required className="h-12 w-32 text-xl" />
                  </div>
                  <Button size="lg" className="h-12">
                    Save the test
                  </Button>
                </div>
              </ActionForm>
            ) : (
              <ActionForm action={logProgram.bind(null, id, "workout")} className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  Five sets, resting {s.next.workout.restSeconds} seconds between them. Change any number to what you actually did, then save.
                </p>
                <ol className="grid grid-cols-5 gap-2">
                  {[...s.next.workout.sets, s.next.workout.lastAtLeast].map((n, i) => (
                    <li key={i} className="grid gap-1 text-center">
                      <Label htmlFor={`set-${i}`} className="text-xs text-muted-foreground">
                        {i === 4 ? "Max" : `Set ${i + 1}`}
                      </Label>
                      <Input id={`set-${i}`} name="set" type="number" inputMode="numeric" min={0} defaultValue={n} className="h-12 px-1 text-center text-xl font-semibold" />
                    </li>
                  ))}
                </ol>
                <p className="text-xs text-muted-foreground">
                  The last set is as many as you can, at least {amount(s.next.workout.lastAtLeast, program.unit)}.
                </p>
                <Button size="lg" className="self-start">
                  Done
                </Button>
              </ActionForm>
            )}
          </>
        )}
      </section>

      {history.length > 0 && (
        <section aria-labelledby="log" className="flex flex-col gap-3">
          <h2 id="log" className="font-serif text-2xl font-black">
            So far
          </h2>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {history.map((l, i) => (
              <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-28 shrink-0 text-sm text-muted-foreground">{onDay(l.done_on)}</span>
                <span className="flex-1">
                  {l.kind === "test" ? (
                    <>
                      <span className="font-semibold">Test:</span> {amount(l.result!, program.unit)}
                    </>
                  ) : (
                    <span className="tabular-nums">{l.sets!.map((n) => amount(n, program.unit)).join(" · ")}</span>
                  )}
                </span>
                {i === 0 && (
                  <ActionForm action={undoProgramLog.bind(null, l.id)} confirm="Undo this one?">
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
        <ActionForm action={saveProgram.bind(null, id)} reset={false} className="flex flex-col gap-4 border-t p-5">
          <ProgramFields value={program} editing />
          <Button className="self-start">Save</Button>
        </ActionForm>
        <ActionForm action={deleteProgram.bind(null, id)} confirm={`Delete ${program.name} and its history?`} className="border-t p-5">
          <Button variant="outline" className="text-red-600">
            Delete program
          </Button>
        </ActionForm>
      </details>
    </>
  );
}
