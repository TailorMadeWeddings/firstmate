import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { dayKey, wallOf } from "@/lib/logbook";
import { currentMedicalMember } from "@/lib/players";
import { saveSession } from "../../actions";
import { loadActivity } from "../../data";
import { SessionFields } from "../../session-fields";

export const metadata: Metadata = { title: "Log a session · Exercise · First Mate" };

type Props = { searchParams: Promise<{ activity?: string }> };

export default function NewSessionPage(props: Props) {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <NewSession {...props} />
      </Suspense>
    </div>
  );
}

async function NewSession({ searchParams }: Props) {
  await currentMedicalMember();
  const { activity: activityId } = await searchParams;
  const activity = activityId ? await loadActivity(activityId) : null;
  if (!activity) notFound();
  const now = wallOf(new Date());
  return (
    <>
      <Link href={`/constitution/exercise/activity/${activity.id}`} className="text-sm text-muted-foreground hover:underline">
        ← {activity.name}
      </Link>
      <h1 className="text-3xl">Log a session: {activity.name}</h1>
      <p className="text-sm text-muted-foreground">For one-off sessions (past or booked ahead). It goes on the Logbook too. Regular ones are ticked off from Exercise.</p>
      <ActionForm action={saveSession.bind(null, activity.id, null, activity.person)} reset={false} className="flex flex-col gap-6 rounded-2xl border bg-card p-5">
        <SessionFields date={dayKey(new Date())} time={`${String(now.h).padStart(2, "0")}:00`} minutes={activity.minutes} />
        <Button size="lg" className="self-start">
          Save
        </Button>
      </ActionForm>
    </>
  );
}
