import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { lastValues } from "@/lib/constitution";
import { dayKey } from "@/lib/logbook";
import { currentHealthOwner } from "@/lib/players";
import { saveEntry } from "../actions";
import { loadHealth } from "../data";
import { EntryForm } from "../entry-form";

export const metadata: Metadata = { title: "This week · Constitution · First Mate" };

export default function NewEntryPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/constitution" className="text-sm text-muted-foreground hover:underline">
        ← Constitution
      </Link>
      <h1 className="text-3xl">This week</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <NewEntry />
      </Suspense>
    </div>
  );
}

async function NewEntry() {
  await currentHealthOwner();
  const { profile, entries } = await loadHealth();
  if (!profile) redirect("/constitution");
  return <EntryForm action={saveEntry.bind(null, null)} date={dayKey(new Date())} last={lastValues(entries)} />;
}
