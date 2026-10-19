import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { currentOwner } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";
import { deleteTransaction, updateTransaction } from "../../actions";
import { type Transaction, TransactionFields, loadAccounts, loadCategories } from "../../shared";

export const metadata: Metadata = { title: "Edit transaction · First Mate" };

export default function EditTransactionPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <EditTransaction params={params} />
    </Suspense>
  );
}

async function EditTransaction({ params }: { params: Promise<{ id: string }> }) {
  await currentOwner();
  const { id } = await params;
  const supabase = await createClient();
  const [accounts, categories, { data }] = await Promise.all([
    loadAccounts(),
    loadCategories(),
    supabase
      .from("budget_transactions")
      .select("id, date, amount, description, notes, account_id, category_id")
      .eq("id", id)
      .maybeSingle<Transaction>(),
  ]);
  if (!data) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex items-baseline gap-3">
        <Link href="/ledger" className="text-sm text-muted-foreground hover:underline">
          ← Ledger
        </Link>
        <h1 className="text-2xl font-bold">Edit transaction</h1>
      </header>
      <ActionForm action={updateTransaction.bind(null, id)} reset={false} className="flex flex-col gap-3">
        <TransactionFields
          accounts={accounts}
          categories={categories}
          recentCategoryIds={[]}
          value={data}
        />
        <Button className="self-start">Save changes</Button>
      </ActionForm>
      <ActionForm action={deleteTransaction.bind(null, id)} confirm="Delete this transaction?">
        <Button variant="outline" className="text-red-600">
          Delete
        </Button>
      </ActionForm>
    </div>
  );
}
