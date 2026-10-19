import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { budgetStatus, money, spendingByCategory, today } from "@/lib/ledger";
import { currentOwner } from "@/lib/players";
import { setLimit } from "../actions";
import { BudgetBar, loadCategories, loadLimits, loadMonthlyTotals } from "../shared";

export const metadata: Metadata = { title: "Budgets · Ledger · First Mate" };

export default function BudgetsPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Budgets />
    </Suspense>
  );
}

async function Budgets() {
  await currentOwner();
  const now = today();
  const month = now.slice(0, 7);
  const [categories, limits, rows] = await Promise.all([loadCategories(), loadLimits(), loadMonthlyTotals(month, month)]);
  const spending = spendingByCategory(rows, categories, month, month);
  const spentOn = (id: string) => spending.find((s) => s.id === id)?.amount ?? 0;
  const limitOf = (id: string) => limits.find((l) => l.category_id === id);
  // Budgets go on top-level expense categories; sub-categories count towards them.
  const budgetable = categories.filter((c) => c.type === "expense" && !c.parent_category_id && !c.archived_at);
  const budgeted = budgetable.filter((c) => limitOf(c.id));
  const totalLimit = budgeted.reduce((s, c) => s + Number(limitOf(c.id)!.monthly_amount), 0);
  const totalSpent = budgeted.reduce((s, c) => s + spentOn(c.id), 0);
  const [y, m, d] = now.split("-").map(Number);
  const daysLeft = new Date(Date.UTC(y, m, 0)).getUTCDate() - d;
  const monthName = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-AU", {
    month: "long",
    timeZone: "UTC",
  });

  // Over budget first, then the closest to their limit, then the rest by name.
  const order = (id: string) => {
    const limit = limitOf(id);
    return limit ? -budgetStatus(spentOn(id), Number(limit.monthly_amount)).percent : 1;
  };
  const rowsInOrder = [...budgetable].sort((a, b) => order(a.id) - order(b.id) || a.name.localeCompare(b.name));

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-1">
        <div className="flex items-baseline gap-3">
          <Link href="/ledger" className="text-sm text-muted-foreground hover:underline">
            ← Ledger
          </Link>
          <h1 className="text-2xl font-bold">Budgets</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          A monthly limit for each expense category. Sub-categories count towards their parent; goal
          savings don&apos;t count as spending. {monthName}: {daysLeft} day{daysLeft === 1 ? "" : "s"} left.
        </p>
      </header>

      {budgeted.length > 0 && (
        <section className="flex flex-col gap-2 rounded-xl border p-4">
          <h2 className="font-semibold">All budgets this month</h2>
          <BudgetBar spent={totalSpent} limit={totalLimit} />
        </section>
      )}

      <ul className="divide-y rounded-xl border">
        {rowsInOrder.map((c) => {
          const limit = limitOf(c.id);
          const spent = spentOn(c.id);
          return (
            <li key={c.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-medium">
                  {c.icon ? `${c.icon} ` : ""}
                  {c.name}
                </span>
                {limit ? (
                  <BudgetBar spent={spent} limit={Number(limit.monthly_amount)} />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No budget · {money(spent)} spent this month
                  </span>
                )}
              </div>
              <ActionForm action={setLimit.bind(null, c.id)} reset={false} className="flex flex-wrap items-center gap-2">
                <Input
                  name="monthly_amount"
                  aria-label={`Monthly budget for ${c.name}`}
                  inputMode="decimal"
                  placeholder="Monthly limit"
                  defaultValue={limit ? Number(limit.monthly_amount).toFixed(2) : ""}
                  className="w-32"
                />
                <Button size="sm" variant="secondary">
                  {limit ? "Save" : "Set"}
                </Button>
              </ActionForm>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">Empty the amount and save to stop budgeting a category.</p>
    </div>
  );
}
