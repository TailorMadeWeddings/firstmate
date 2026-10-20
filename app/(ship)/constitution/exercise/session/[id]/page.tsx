import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { dayKey, wallOf } from "@/lib/logbook";
import { currentMedicalMember } from "@/lib/players";
import { deleteSession, saveSession } from "../../actions";
import { loadActivity, loadSession } from "../../data";
import { SessionFields } from "../../session-fields";

export const metadata: Metadata = { title: "Session · Exercise · First Mate" };

type Props = { params: Promise<{ id: string }> };

export default function SessionPage(props: Props) {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <EditSession {...props} />
      </Suspense>
    </div>
  );
}

async function EditSession({ params }: Props) {
  await currentMedicalMember();
  const { id } = await params;
  const session = await loadSession(id);
  const activity = session ? await loadActivity(session.activity_id) : null;
  if (!session || !activity) notFound();
  const start = new Date(session.starts_at);
  const w = wallOf(start);
  return (
    <>
      <Link href={`/constitution/exercise/activity/${activity.id}`} className="text-sm text-muted-foreground hover:underline">
        ← {activity.name}
      </Link>
      <h1 className="text-3xl">{activity.name}</h1>
      <ActionForm action={saveSession.bind(null, activity.id, id, activity.person)} reset={false} className="flex flex-col gap-6 rounded-2xl border bg-card p-5">
        <SessionFields
          date={dayKey(start)}
          time={`${String(w.h).padStart(2, "0")}:${String(w.min).padStart(2, "0")}`}
          minutes={session.minutes}
          distance={session.distance_km}
          notes={session.notes}
        />
        <Button size="lg" className="self-start">
          Save
        </Button>
      </ActionForm>
      <ActionForm action={deleteSession.bind(null, id, activity.person)} confirm={session.schedule_id ? "Untick this session?" : "Delete this session? It comes off the Logbook too."}>
        <Button variant="outline" className="text-red-600">
          {session.schedule_id ? "Untick it" : "Delete"}
        </Button>
      </ActionForm>
    </>
  );
}
