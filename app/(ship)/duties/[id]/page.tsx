import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { currentCrew } from "@/lib/players";
import { loadCrew } from "../../logbook/data";
import { deleteDuty, saveDuty } from "../actions";
import { loadDuties, loadDuty } from "../data";
import { DutyFields } from "../duty-fields";

export const metadata: Metadata = { title: "Duty · First Mate" };

export default function DutyPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <EditDuty params={params} />
    </Suspense>
  );
}

async function EditDuty({ params }: { params: Promise<{ id: string }> }) {
  const member = await currentCrew();
  const { id } = await params;
  const [duty, crew, { open, done }] = await Promise.all([loadDuty(id), loadCrew(member.householdId), loadDuties()]);
  if (!duty) notFound();
  const categories = [...new Set([...open, ...done].map((d) => d.category).filter((c): c is string => Boolean(c)))].sort();
  // Row-level security has the final say; this just hides a button that wouldn't work.
  const canDelete = member.role === "owner" || duty.created_by === member.id;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/duties" className="text-sm text-muted-foreground hover:underline">
        ← Duties
      </Link>
      <h1 className="text-3xl">{duty.done_at ? "Done: " : ""}{duty.title}</h1>
      <ActionForm action={saveDuty.bind(null, id)} reset={false} className="flex flex-col gap-6 rounded-2xl border bg-card p-5">
        <DutyFields duty={duty} crew={crew} categories={categories} />
        <Button size="lg" className="self-start">
          Save changes
        </Button>
      </ActionForm>
      {canDelete && (
        <ActionForm action={deleteDuty.bind(null, id)} confirm={`Delete “${duty.title}”?`}>
          <Button variant="outline" className="text-red-600">
            Delete
          </Button>
        </ActionForm>
      )}
    </div>
  );
}
