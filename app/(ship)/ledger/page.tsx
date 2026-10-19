import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ACCOUNT_TYPES, label, money } from "@/lib/ledger";
import { currentOwner } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";
import { addAccount, addTransaction, importCsv } from "./actions";
import { type Transaction, TransactionFields, loadAccounts, loadCategories } from "./shared";

export const metadata: Metadata = { title: "Ledger · First Mate" };

type Search = Promise<{ imported?: string; skipped?: string }>;

export default function Ledger({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <LedgerHome searchParams={searchParams} />
    </Suspense>
  );
}

async function LedgerHome({ searchParams }: { searchParams: Search }) {
  await currentOwner();
  const { imported, skipped } = await searchParams;
  const supabase = await createClient();
  const [accounts, categories, balances, recent] = await Promise.all([
    loadAccounts(),
    loadCategories(),
    supabase.from("budget_account_balances").select("id, balance"),
    supabase
      .from("budget_transactions")
      .select("id, date, amount, description, notes, account_id, category_id")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (balances.error) throw balances.error;
  if (recent.error) throw recent.error;
  const balanceOf = (id: string) => balances.data.find((b) => b.id === id)?.balance ?? 0;
  const transactions = recent.data as Transaction[];
  const total = accounts.reduce((sum, a) => sum + Number(balanceOf(a.id)), 0);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Ledger</h1>
        <Link href="/ledger/categories" className="text-sm hover:underline">
          Categories
        </Link>
      </header>

      {imported !== undefined && (
        <p role="status" className="rounded-xl border px-4 py-3 text-sm">
          Imported {imported} transaction{imported === "1" ? "" : "s"}
          {Number(skipped) > 0 && `, skipped ${skipped} already in the Ledger`}.
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Accounts</h2>
        {accounts.length > 0 && (
          <ul className="divide-y rounded-xl border">
            {accounts.map((a) => (
              <li key={a.id} className="flex justify-between gap-4 px-4 py-3">
                <span>
                  {a.name} <span className="text-sm text-muted-foreground">{a.type}</span>
                </span>
                <Amount value={balanceOf(a.id)} currency={a.currency} />
              </li>
            ))}
            <li className="flex justify-between gap-4 px-4 py-3 font-semibold">
              <span>Total</span>
              <Amount value={total} />
            </li>
          </ul>
        )}
        <details open={accounts.length === 0}>
          <summary className="cursor-pointer text-sm text-muted-foreground">
            {accounts.length ? "Add an account" : "Add your first account to start"}
          </summary>
          <ActionForm action={addAccount} className="mt-3 grid gap-3 sm:grid-cols-4 sm:items-end">
            <div className="grid gap-1">
              <Label htmlFor="acct-name">Name</Label>
              <Input id="acct-name" name="name" placeholder="Everyday" required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="acct-type">Type</Label>
              <NativeSelect id="acct-type" name="type">
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="acct-opening">Balance today</Label>
              <Input id="acct-opening" name="opening_balance" inputMode="decimal" placeholder="0.00" />
            </div>
            <Button>Add account</Button>
          </ActionForm>
        </details>
      </section>

      {accounts.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Add a transaction</h2>
          <ActionForm action={addTransaction} className="flex flex-col gap-3 rounded-xl border p-4">
            <TransactionFields
              accounts={accounts}
              categories={categories}
              recentCategoryIds={transactions.map((t) => t.category_id)}
            />
            <Button className="self-start">Save</Button>
          </ActionForm>
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">
              Import a CommBank CSV
            </summary>
            <ActionForm action={importCsv} className="mt-3 flex flex-col gap-3 rounded-xl border p-4">
              <p className="text-sm text-muted-foreground">
                In NetBank, open the account, choose Export and pick CSV. Importing the same
                dates again is safe: transactions already here are skipped.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1">
                  <Label htmlFor="import-account">Into account</Label>
                  <NativeSelect id="import-account" name="account_id">
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="import-file">CSV file</Label>
                  <Input id="import-file" name="file" type="file" accept=".csv,text/csv" required />
                </div>
              </div>
              <Button className="self-start">Import</Button>
            </ActionForm>
          </details>
        </section>
      )}

      {transactions.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Recent</h2>
          <ul className="divide-y rounded-xl border">
            {transactions.map((t) => {
              const category = categories.find((c) => c.id === t.category_id);
              const account = accounts.find((a) => a.id === t.account_id);
              return (
                <li key={t.id}>
                  <Link
                    href={`/ledger/transactions/${t.id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted"
                  >
                    <span className="min-w-0">
                      <span className="block truncate">
                        {t.description || (category ? label(category, categories) : "Uncategorised")}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {t.date}
                        {t.description && category && ` · ${label(category, categories)}`}
                        {account && ` · ${account.name}`}
                      </span>
                    </span>
                    <Amount value={t.amount} currency={account?.currency} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function Amount({ value, currency }: { value: number | string; currency?: string }) {
  return (
    <span className={`tabular-nums ${Number(value) < 0 ? "" : "text-emerald-700 dark:text-emerald-400"}`}>
      {money(value, currency)}
    </span>
  );
}
