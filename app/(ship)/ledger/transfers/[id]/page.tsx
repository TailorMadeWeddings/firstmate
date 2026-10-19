import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { transfersById } from "@/lib/ledger";
import { currentOwner } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";
import { deleteTransfer, saveTransfer } from "../../actions";
import { TransferFields, loadAccounts, loadGoals } from "../../shared";

export const metadata: Metadata = { title: "Edit transfer · First Mate" };

export default function EditTransferPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <EditTransfer params={params} />
    </Suspense>
  );
}

async function EditTransfer({ params }: { params: Promise<{ id: string }> }) {
  await currentOwner();
  const { id } = await params;
  const supabase = await createClient();
  const [accounts, goals, { data: legs }] = await Promise.all([
    loadAccounts(),
    loadGoals(),
    supabase
      .from("budget_transactions")
      .select("account_id, amount, date, description, transfer_id, goal_id")
      .eq("transfer_id", id),
  ]);
  const transfer = transfersById(legs ?? [])[id];
  if (!transfer) notFound();
  const goal = goals.find((g) => g.id === transfer.goalId);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-baseline gap-3">
          <Link href="/ledger" className="text-sm text-muted-foreground hover:underline">
            ← Ledger
          </Link>
          <h1 className="text-2xl font-bold">Edit transfer</h1>
        </div>
        {goal && <p className="text-sm text-muted-foreground">Savings towards {goal.name}.</p>}
      </header>
      <ActionForm action={saveTransfer.bind(null, id)} reset={false} className="flex flex-col gap-3">
        <TransferFields accounts={accounts} value={transfer} />
        <Button className="self-start">Save changes</Button>
      </ActionForm>
      <ActionForm action={deleteTransfer.bind(null, id)} confirm="Delete this transfer from both accounts?">
        <Button variant="outline" className="text-red-600">
          Delete
        </Button>
      </ActionForm>
    </div>
  );
}
