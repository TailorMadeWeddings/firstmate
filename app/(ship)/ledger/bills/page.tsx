import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { label } from "@/lib/ledger";
import { currentOwner } from "@/lib/players";
import { addBill, deleteBill, updateBill } from "../actions";
import { BillFields, BillRow, loadAccounts, loadBills, loadCategories } from "../shared";

export const metadata: Metadata = { title: "Bills · Ledger · First Mate" };

export default function BillsPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Bills />
    </Suspense>
  );
}

async function Bills() {
  await currentOwner();
  const [bills, accounts, categories] = await Promise.all([loadBills(), loadAccounts(), loadCategories()]);

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <header className="flex items-baseline gap-3">
        <Link href="/ledger" className="text-sm text-muted-foreground hover:underline">
          ← Ledger
        </Link>
        <h1 className="text-2xl font-bold">Bills</h1>
      </header>

      {accounts.length === 0 ? (
        <p className="text-muted-foreground">
          <Link href="/ledger" className="underline">
            Add an account
          </Link>{" "}
          first, so bills have somewhere to be paid from.
        </p>
      ) : (
        <details open={bills.length === 0} className="rounded-xl border p-4">
          <summary className="cursor-pointer font-semibold">Add a bill</summary>
          <ActionForm action={addBill} className="mt-3 flex flex-col gap-3">
            <BillFields accounts={accounts} categories={categories} />
            <Button className="self-start">Add bill</Button>
          </ActionForm>
        </details>
      )}

      {bills.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-xl border">
          {bills.map((bill) => {
            const category = categories.find((c) => c.id === bill.category_id);
            const account = accounts.find((a) => a.id === bill.account_id);
            return (
              <li key={bill.id}>
                <BillRow bill={bill}>
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      {category ? label(category, categories) : "No category"} ·{" "}
                      {account?.name ?? "No account"}
                      {bill.last_paid && ` · last paid ${bill.last_paid}`} · Edit
                    </summary>
                    <ActionForm
                      action={updateBill.bind(null, bill.id)}
                      reset={false}
                      className="mt-3 flex flex-col gap-3"
                    >
                      <BillFields accounts={accounts} categories={categories} value={bill} />
                      <Button variant="secondary" className="self-start">
                        Save bill
                      </Button>
                    </ActionForm>
                    <ActionForm
                      action={deleteBill.bind(null, bill.id)}
                      confirm={`Delete the ${bill.name} bill? Payments already recorded stay.`}
                      className="mt-2"
                    >
                      <Button variant="outline" size="sm" className="text-red-600">
                        Delete bill
                      </Button>
                    </ActionForm>
                  </details>
                </BillRow>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
