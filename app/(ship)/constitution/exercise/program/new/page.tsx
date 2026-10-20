import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { STARTER_PROGRAMS, amount, dayNames } from "@/lib/exercise";
import { currentMedicalMember } from "@/lib/players";
import { saveProgram } from "../../actions";
import { ProgramFields } from "../../program-fields";

export const metadata: Metadata = { title: "Start a program · Exercise · First Mate" };

type Props = { searchParams: Promise<{ template?: string }> };

export default function NewProgramPage(props: Props) {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/constitution/exercise" className="text-sm text-muted-foreground hover:underline">
        ← Exercise
      </Link>
      <h1 className="text-3xl">Start a program</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <NewProgram {...props} />
      </Suspense>
    </div>
  );
}

async function NewProgram({ searchParams }: Props) {
  await currentMedicalMember();
  const { template } = await searchParams;
  const start = STARTER_PROGRAMS.find((t) => t.key === template);
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Like 100 Pushups: you start with a test of how many you can do in one go. Each workout is then five sets built from that, a little harder each time,
        and every six workouts you test again. Keep going until you reach the goal.
      </p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {STARTER_PROGRAMS.map((t) => (
          <li key={t.key}>
            <Link
              href={`/constitution/exercise/program/new?template=${t.key}`}
              aria-current={t.key === template ? "true" : undefined}
              className="flex flex-col rounded-xl border bg-card px-4 py-3 hover:bg-muted aria-[current=true]:border-primary"
            >
              <span className="font-semibold">{t.name}</span>
              <span className="text-xs text-muted-foreground">
                Goal {amount(t.goal, t.unit)} · {dayNames([...t.weekdays])}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <ActionForm key={template ?? "own"} action={saveProgram.bind(null, null)} reset={false} className="flex flex-col gap-5 rounded-2xl border bg-card p-5">
        <ProgramFields value={start ?? { name: "", exercise: "", unit: "reps", goal: 50, weekdays: ["MO", "WE", "FR"] }} />
        <Button size="lg" className="self-start">
          Start
        </Button>
      </ActionForm>
    </>
  );
}
