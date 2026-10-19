import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ACCOUNT_TYPES, budgetStatus, daysUntil, label, money, spendingByCategory, today } from "@/lib/ledger";
import { currentOwner } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";
import { addAccount, addTransaction } from "./actions";
import {
  BillRow,
  BudgetBar,
  type Transaction,
  TransactionFields,
  loadAccounts,
  loadBills,
  loadCategories,
  loadGoals,
  loadLimits,
  loadMonthlyTotals,
} from "./shared";

export const metadata: Metadata = { title: "Ledger · First Mate" };

export default function Ledger() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <LedgerHome />
    </Suspense>
  );
}

async function LedgerHome() {
  await currentOwner();
  const supabase = await createClient();
  const month = today().slice(0, 7);
  const [accounts, categories, bills, goals, limits, monthRows, balances, recent] = await Promise.all([
    loadAccounts(),
    loadCategories(),
    loadBills(),
    loadGoals(),
    loadLimits(),
    loadMonthlyTotals(month, month),
    supabase.from("budget_account_balances").select("id, balance"),
    supabase
      .from("budget_transactions")
      .select("id, date, amount, description, notes, account_id, category_id, goal_id")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (balances.error) throw balances.error;
  if (recent.error) throw recent.error;
  const balanceOf = (id: string) => balances.data.find((b) => b.id === id)?.balance ?? 0;
  const transactions = recent.data as Transaction[];
  const total = accounts.reduce((sum, a) => sum + Number(balanceOf(a.id)), 0);
  // Overdue first (bills are ordered by due date), then the next 30 days.
  const upcoming = bills.filter((b) => daysUntil(b.next_due) <= 30);
  // The budgets closest to (or over) their limit this month.
  const spending = spendingByCategory(monthRows, categories, month, month);
  const budgets = limits
    .map((l) => {
      const spent = spending.find((s) => s.id === l.category_id)?.amount ?? 0;
      const limit = Number(l.monthly_amount);
      return { category: categories.find((c) => c.id === l.category_id), spent, limit, used: budgetStatus(spent, limit).percent };
    })
    .sort((a, b) => b.used - a.used)
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Ledger</h1>
        <nav className="flex gap-4 text-sm">
          {["reports", "budgets", "bills", "goals", "categories"].map((page) => (
            <Link key={page} href={`/ledger/${page}`} className="capitalize hover:underline">
              {page}
            </Link>
          ))}
        </nav>
      </header>

      {budgets.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">Budgets this month</h2>
            <Link href="/ledger/budgets" className="text-sm text-muted-foreground hover:underline">
              All budgets
            </Link>
          </div>
          <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
            {budgets.map((b) => (
              <div key={b.category?.id} className="flex flex-col gap-1">
                <span className="text-sm font-medium">{b.category?.name}</span>
                <BudgetBar spent={b.spent} limit={b.limit} />
              </div>
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Upcoming bills</h2>
          <ul className="divide-y overflow-hidden rounded-xl border">
            {upcoming.map((bill) => (
              <li key={bill.id}>
                <BillRow bill={bill} />
              </li>
            ))}
          </ul>
        </section>
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
        </section>
      )}

      {transactions.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Recent</h2>
          <ul className="divide-y rounded-xl border">
            {transactions.map((t) => {
              const category = categories.find((c) => c.id === t.category_id);
              const account = accounts.find((a) => a.id === t.account_id);
              const goal = goals.find((g) => g.id === t.goal_id);
              return (
                <li key={t.id}>
                  <Link
                    href={goal ? "/ledger/goals" : `/ledger/transactions/${t.id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted"
                  >
                    <span className="min-w-0">
                      <span className="block truncate">
                        {goal
                          ? `Saved for ${goal.name}`
                          : t.description || (category ? label(category, categories) : "Uncategorised")}
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
