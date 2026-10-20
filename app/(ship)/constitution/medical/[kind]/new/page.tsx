import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { dayKey } from "@/lib/logbook";
import { KINDS, isKind, isPersonKey } from "@/lib/medical";
import { currentHealthOwner } from "@/lib/players";
import { saveRecord } from "../../actions";
import { loadSubjects } from "../../data";
import { RecordFields } from "../../record-fields";

export const metadata: Metadata = { title: "New record · Medical · First Mate" };

type Props = { params: Promise<{ kind: string }>; searchParams: Promise<{ person?: string }> };

export default function NewRecordPage(props: Props) {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <NewRecord {...props} />
      </Suspense>
    </div>
  );
}

async function NewRecord({ params, searchParams }: Props) {
  const member = await currentHealthOwner();
  const { kind } = await params;
  const { person } = await searchParams;
  const subject = (await loadSubjects(member.householdId)).find((s) => s.key === person);
  if (!isKind(kind) || !isPersonKey(person) || !subject) notFound();
  const today = dayKey(new Date());
  const values: Record<string, string> =
    kind === "appointment" ? {} : kind === "result" ? { taken_on: today } : { given_on: today };
  return (
    <>
      <Link href={`/constitution/medical?person=${encodeURIComponent(person)}`} className="text-sm text-muted-foreground hover:underline">
        ← {subject.name}
      </Link>
      <h1 className="text-3xl">
        {KINDS[kind].title} for {subject.name}
      </h1>
      <ActionForm action={saveRecord.bind(null, kind, null, person)} reset={false} className="flex flex-col gap-6 rounded-2xl border bg-card p-5">
        <RecordFields kind={kind} values={values} />
        <Button size="lg" className="self-start">
          Save
        </Button>
      </ActionForm>
    </>
  );
}
