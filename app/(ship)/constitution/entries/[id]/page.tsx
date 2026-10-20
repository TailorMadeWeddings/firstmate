import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { currentHealthOwner } from "@/lib/players";
import { deleteEntry, saveEntry } from "../../actions";
import { loadEntry } from "../../data";
import { EntryForm } from "../../entry-form";

export const metadata: Metadata = { title: "Entry · Constitution · First Mate" };

export default function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/constitution" className="text-sm text-muted-foreground hover:underline">
        ← Constitution
      </Link>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <EditEntry params={params} />
      </Suspense>
    </div>
  );
}

async function EditEntry({ params }: { params: Promise<{ id: string }> }) {
  await currentHealthOwner();
  const { id } = await params;
  const entry = await loadEntry(id);
  if (!entry) notFound();
  const when = new Date(`${entry.entry_date}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <>
      <h1 className="text-3xl">Week ending {when}</h1>
      <EntryForm action={saveEntry.bind(null, id)} entry={entry} date={entry.entry_date} last={{}} />
      <ActionForm action={deleteEntry.bind(null, id)} confirm="Delete this week's entry?">
        <Button variant="outline" className="text-red-600">
          Delete entry
        </Button>
      </ActionForm>
    </>
  );
}
