import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { wallOf } from "@/lib/logbook";
import { KINDS, isKind, personKey } from "@/lib/medical";
import { currentHealthOwner } from "@/lib/players";
import { deleteRecord, saveRecord } from "../../actions";
import { loadRecord, loadSubjects } from "../../data";
import { RecordFields } from "../../record-fields";

export const metadata: Metadata = { title: "Record · Medical · First Mate" };

type Props = { params: Promise<{ kind: string; id: string }> };

export default function RecordPage(props: Props) {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <EditRecord {...props} />
      </Suspense>
    </div>
  );
}

/** "2026-11-03T09:00" in Sydney time, for a datetime-local field. */
const local = (iso: string) => {
  const w = wallOf(new Date(iso));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${w.y}-${p(w.m)}-${p(w.d)}T${p(w.h)}:${p(w.min)}`;
};

async function EditRecord({ params }: Props) {
  const member = await currentHealthOwner();
  const { kind, id } = await params;
  if (!isKind(kind)) notFound();
  const record = await loadRecord(kind, id);
  if (!record) notFound();
  const person = personKey(record);
  const subject = (await loadSubjects(member.householdId)).find((s) => s.key === person);
  const values = Object.fromEntries(
    Object.entries(record).map(([k, v]) => [k, v === null ? "" : k === "starts_at" ? local(String(v)) : String(v)]),
  );
  return (
    <>
      <Link href={`/constitution/medical?person=${encodeURIComponent(person)}`} className="text-sm text-muted-foreground hover:underline">
        ← {subject?.name ?? "Medical records"}
      </Link>
      <h1 className="text-3xl">
        {KINDS[kind].title}
        {subject ? ` for ${subject.name}` : ""}
      </h1>
      <ActionForm action={saveRecord.bind(null, kind, id, person)} reset={false} className="flex flex-col gap-6 rounded-2xl border bg-card p-5">
        <RecordFields kind={kind} values={values} />
        <Button size="lg" className="self-start">
          Save changes
        </Button>
      </ActionForm>
      <ActionForm action={deleteRecord.bind(null, kind, id, person)} confirm={`Delete this ${KINDS[kind].title.toLowerCase()}?${kind === "appointment" ? " It comes off the Logbook too." : ""}`}>
        <Button variant="outline" className="text-red-600">
          Delete
        </Button>
      </ActionForm>
    </>
  );
}
