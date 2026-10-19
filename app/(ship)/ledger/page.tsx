import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { currentMember } from "@/lib/players";

export const metadata: Metadata = { title: "Ledger · First Mate" };

export default function Ledger() {
  return (
    <Suspense>
      <OwnersOnly />
    </Suspense>
  );
}

async function OwnersOnly() {
  // Hidden, not forbidden: other members shouldn't learn there's a Ledger at all.
  if ((await currentMember()).role !== "owner") notFound();
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-3xl font-bold">Ledger</h1>
      <p className="text-muted-foreground">Accounts, bills and savings goals. Owners only.</p>
      <p className="mt-6 text-sm text-muted-foreground">
        Coming next: transaction entry, categories, recurring bills, savings goals and reports.
      </p>
    </section>
  );
}
