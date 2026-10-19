import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type Category,
  type MonthlyTotal,
  type Period,
  addMonths,
  daysUntil,
  label,
  money,
  monthly,
  pace,
  period,
  spendingByCategory,
  today,
  totals,
  withChildren,
} from "@/lib/ledger";
import { currentOwner } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";
import { type Transaction, loadAccounts, loadBills, loadCategories, loadGoals } from "../shared";

export const metadata: Metadata = { title: "Reports · Ledger · First Mate" };

type Search = { from?: string; to?: string; category?: string };

export default function ReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Reports searchParams={searchParams} />
    </Suspense>
  );
}

const monthName = (m: string, year = true) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-AU", {
    month: "short",
    year: year ? "numeric" : undefined,
    timeZone: "UTC",
  });

const rangeName = ({ from, to }: { from: string; to: string }) =>
  from === to ? monthName(from) : `${monthName(from, from.slice(0, 4) !== to.slice(0, 4))} – ${monthName(to)}`;

const compact = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", notation: "compact" }).format(n);

async function Reports({ searchParams }: { searchParams: Promise<Search> }) {
  await currentOwner();
  const search = await searchParams;
  const p = period(search.from, search.to);
  const trendMonths = Array.from({ length: 12 }, (_, i) => addMonths(p.to, i - 11));
  const start = [p.previous.from, trendMonths[0]].sort()[0];
  const supabase = await createClient();
  const [categories, accounts, bills, goals, totalsRes, balancesRes, progressRes] = await Promise.all([
    loadCategories(),
    loadAccounts(),
    loadBills(),
    loadGoals(),
    supabase
      .from("budget_monthly_totals")
      .select("month, category_id, money_in, money_out")
      .gte("month", `${start}-01`)
      .lte("month", `${p.to}-01`),
    supabase.from("budget_account_balances").select("id, balance"),
    supabase.from("budget_goal_progress").select("id, saved"),
  ]);
  for (const r of [totalsRes, balancesRes, progressRes]) if (r.error) throw r.error;
  const rows = totalsRes.data as MonthlyTotal[];

  const now = totals(rows, p.from, p.to);
  const before = totals(rows, p.previous.from, p.previous.to);
  const spending = spendingByCategory(rows, categories, p.from, p.to);
  const trend = monthly(rows, trendMonths);
  const query = (extra: Record<string, string> = {}) =>
    `?${new URLSearchParams({ from: p.from, to: p.to, ...extra })}`;

  const balance = (balancesRes.data ?? []).reduce((sum, b) => sum + Number(b.balance), 0);
  const dueSoon = bills.filter((b) => daysUntil(b.next_due) <= 30);
  const openGoals = goals.filter((g) => !g.completed_at);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-baseline gap-3">
        <Link href="/ledger" className="text-sm text-muted-foreground hover:underline">
          ← Ledger
        </Link>
        <h1 className="text-2xl font-bold">Reports</h1>
      </header>

      <Filters period={p} category={search.category} />

      <section aria-label={`Totals for ${rangeName(p)}`} className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Money in" value={now.moneyIn} was={before.moneyIn} upIsGood />
        <StatTile label="Money out" value={now.moneyOut} was={before.moneyOut} upIsGood={false} />
        <StatTile label="Net" value={now.net} was={before.net} upIsGood />
        <p className="text-xs text-muted-foreground sm:col-span-3">
          {rangeName(p)}, compared with {rangeName(p.previous)}. Savings put towards goals aren&apos;t
          counted as spending.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Spending by category · {rangeName(p)}</h2>
        {spending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No spending in this period.</p>
        ) : (
          <CategoryBars spending={spending} categories={categories} query={query} selected={search.category} />
        )}
        {search.category && (
          <DrillDown
            period={p}
            categoryId={search.category}
            categories={categories}
            accounts={accounts}
            clear={query()}
          />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Money in and out · 12 months to {monthName(p.to)}</h2>
        <Trend trend={trend} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">At a glance</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Link href="/ledger" className="rounded-xl border p-4 hover:bg-muted">
            <p className="text-sm text-muted-foreground">Across {accounts.length} account{accounts.length === 1 ? "" : "s"}</p>
            <p className="text-2xl font-semibold">{money(balance)}</p>
          </Link>
          <Link href="/ledger/bills" className="rounded-xl border p-4 hover:bg-muted">
            <p className="text-sm text-muted-foreground">
              {dueSoon.length} bill{dueSoon.length === 1 ? "" : "s"} due in the next 30 days
            </p>
            <p className="text-2xl font-semibold">{money(dueSoon.reduce((s, b) => s + Number(b.amount), 0))}</p>
            {dueSoon.some((b) => daysUntil(b.next_due) < 0) && (
              <p className="text-sm font-semibold text-red-600">Some are overdue</p>
            )}
          </Link>
          <Link href="/ledger/goals" className="flex flex-col gap-2 rounded-xl border p-4 hover:bg-muted">
            <p className="text-sm text-muted-foreground">Savings goals</p>
            {openGoals.length === 0 && <p className="text-sm">None in progress</p>}
            {openGoals.slice(0, 4).map((g) => {
              const saved = Number(progressRes.data?.find((x) => x.id === g.id)?.saved ?? 0);
              const { percent } = pace(g, saved);
              return (
                <div key={g.id} className="flex flex-col gap-1">
                  <span className="flex justify-between text-sm">
                    <span>{g.name}</span>
                    <span className="tabular-nums text-muted-foreground">{percent}%</span>
                  </span>
                  <span
                    className="h-1.5 overflow-hidden rounded-full"
                    style={{ background: "color-mix(in srgb, var(--money-in) 20%, transparent)" }}
                  >
                    <span className="block h-full rounded-full bg-[var(--money-in)]" style={{ width: `${percent}%` }} />
                  </span>
                </div>
              );
            })}
          </Link>
        </div>
      </section>
    </div>
  );
}

/** Presets and a custom month range, in one row above everything they scope. */
function Filters({ period: p, category }: { period: Period; category?: string }) {
  const thisMonth = today().slice(0, 7);
  const presets: [string, string, string][] = [
    ["This month", thisMonth, thisMonth],
    ["Last month", addMonths(thisMonth, -1), addMonths(thisMonth, -1)],
    ["Last 3 months", addMonths(thisMonth, -2), thisMonth],
    ["This year", `${thisMonth.slice(0, 4)}-01`, thisMonth],
  ];
  return (
    <div className="flex flex-wrap items-end gap-2">
      {presets.map(([name, from, to]) => {
        const active = p.from === from && p.to === to;
        return (
          <Button key={name} asChild size="sm" variant={active ? "default" : "outline"}>
            <Link href={`?${new URLSearchParams({ from, to })}`} aria-current={active ? "true" : undefined}>
              {name}
            </Link>
          </Button>
        );
      })}
      <form className="flex flex-wrap items-end gap-2">
        <Input name="from" type="month" aria-label="From month" defaultValue={p.from} className="w-[9.5rem]" />
        <span className="pb-2 text-sm text-muted-foreground">to</span>
        <Input name="to" type="month" aria-label="To month" defaultValue={p.to} className="w-[9.5rem]" />
        {category && <input type="hidden" name="category" value={category} />}
        <Button size="sm" variant="secondary">
          Show
        </Button>
      </form>
    </div>
  );
}

function StatTile({
  label: name,
  value,
  was,
  upIsGood,
}: {
  label: string;
  value: number;
  was: number;
  upIsGood: boolean;
}) {
  const change = Math.round((value - was) * 100) / 100;
  const good = change === 0 ? null : change > 0 === upIsGood;
  return (
    <div className="flex flex-col gap-1 rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">{name}</p>
      <p className="text-3xl font-semibold">{money(value)}</p>
      <p
        className={`text-sm ${
          good === null ? "text-muted-foreground" : good ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"
        }`}
      >
        {change === 0 ? "No change" : `${change > 0 ? "▲ +" : "▼ −"}${money(Math.abs(change))}`} vs before
      </p>
    </div>
  );
}

/** One series (spending), so one colour and no legend; the value sits at each bar's tip. */
function CategoryBars({
  spending,
  categories,
  query,
  selected,
}: {
  spending: { id: string | null; amount: number }[];
  categories: Category[];
  query: (extra?: Record<string, string>) => string;
  selected?: string;
}) {
  const max = spending[0].amount;
  return (
    <ul className="flex flex-col">
      {spending.map(({ id, amount }) => {
        const c = categories.find((x) => x.id === id);
        const key = id ?? "none";
        const name = c ? `${c.icon ? `${c.icon} ` : ""}${c.name}` : "Uncategorised";
        return (
          <li key={key}>
            <Link
              href={query({ category: key })}
              aria-current={selected === key ? "true" : undefined}
              className="group grid grid-cols-[minmax(6rem,10rem)_1fr] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted aria-[current]:bg-muted"
            >
              <span className="truncate text-sm">{name}</span>
              <span className="flex items-center gap-2">
                <span
                  className="h-4 rounded-r-[4px] bg-[var(--money-out)] transition group-hover:brightness-110"
                  style={{ width: `${Math.max((amount / max) * 85, 1)}%` }}
                />
                <span className="whitespace-nowrap text-sm tabular-nums">{money(amount)}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

async function DrillDown({
  period: p,
  categoryId,
  categories,
  accounts,
  clear,
}: {
  period: Period;
  categoryId: string;
  categories: Category[];
  accounts: { id: string; name: string }[];
  clear: string;
}) {
  const supabase = await createClient();
  let q = supabase
    .from("budget_transactions")
    .select("id, date, amount, description, notes, account_id, category_id, goal_id")
    .is("goal_id", null)
    .gte("date", `${p.from}-01`)
    .lt("date", `${addMonths(p.to, 1)}-01`)
    .order("date", { ascending: false })
    .limit(200);
  const c = categories.find((x) => x.id === categoryId);
  q = c ? q.in("category_id", withChildren(c.id, categories)) : q.is("category_id", null);
  const { data, error } = await q;
  if (error) throw error;
  const rows = data as Transaction[];

  return (
    <div className="flex flex-col gap-2 rounded-xl border p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-semibold">
          {c ? c.name : "Uncategorised"} · {rows.length} transaction{rows.length === 1 ? "" : "s"}
        </h3>
        <Link href={clear} className="text-sm text-muted-foreground hover:underline">
          Close
        </Link>
      </div>
      <ul className="divide-y text-sm">
        {rows.map((t) => {
          const cat = categories.find((x) => x.id === t.category_id);
          return (
            <li key={t.id}>
              <Link href={`/ledger/transactions/${t.id}`} className="flex justify-between gap-3 py-2 hover:underline">
                <span className="min-w-0 truncate">
                  {t.description || (cat ? label(cat, categories) : "Uncategorised")}
                  <span className="text-muted-foreground">
                    {" "}
                    · {t.date} · {accounts.find((a) => a.id === t.account_id)?.name}
                  </span>
                </span>
                <span className="tabular-nums">{money(t.amount)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {rows.length === 200 && <p className="text-xs text-muted-foreground">Showing the latest 200.</p>}
    </div>
  );
}

/**
 * Two series, so a legend; columns grow from one baseline with a 2px gap.
 * Each month is focusable and shows both values on hover or focus; the table
 * view carries every number without hovering.
 */
function Trend({ trend }: { trend: ReturnType<typeof monthly> }) {
  const max = Math.max(...trend.flatMap((m) => [m.moneyIn, m.moneyOut]), 1);
  if (trend.every((m) => !m.moneyIn && !m.moneyOut)) {
    return <p className="text-sm text-muted-foreground">Nothing recorded in these months yet.</p>;
  }
  const height = (n: number) => `${(n / max) * 100}%`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-[var(--money-in)]" aria-hidden /> Money in
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-[var(--money-out)]" aria-hidden /> Money out
        </span>
      </div>
      <div className="relative flex flex-col">
        <div className="flex justify-between border-t text-xs text-muted-foreground">
          <span className="-mt-px pt-0.5 tabular-nums">{compact(max)}</span>
        </div>
        <div className="flex h-44 items-end border-b">
          {trend.map((m, i) => (
            <div
              key={m.month}
              tabIndex={0}
              aria-label={`${monthName(m.month)}: in ${money(m.moneyIn)}, out ${money(m.moneyOut)}`}
              className="group relative flex h-full flex-1 items-end justify-center gap-[2px] rounded-sm px-[2px] outline-none hover:bg-muted/60 focus-visible:bg-muted"
            >
              <span className="w-full max-w-[24px] rounded-t-[4px] bg-[var(--money-in)]" style={{ height: height(m.moneyIn) }} />
              <span className="w-full max-w-[24px] rounded-t-[4px] bg-[var(--money-out)]" style={{ height: height(m.moneyOut) }} />
              <span
                role="tooltip"
                className={`pointer-events-none absolute bottom-full z-10 mb-1 hidden min-w-36 rounded-md border bg-background p-2 text-xs shadow-md group-hover:block group-focus-visible:block ${
                  i < trend.length / 2 ? "left-0" : "right-0"
                }`}
              >
                <span className="block text-muted-foreground">{monthName(m.month)}</span>
                {(
                  [
                    ["In", m.moneyIn, "var(--money-in)"],
                    ["Out", m.moneyOut, "var(--money-out)"],
                  ] as const
                ).map(([name, value, colour]) => (
                  <span key={name} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="h-0.5 w-3" style={{ background: colour }} aria-hidden />
                      {name}
                    </span>
                    <span className="font-semibold tabular-nums">{money(value)}</span>
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
        <div className="flex text-[10px] text-muted-foreground">
          {trend.map((m, i) => (
            <span key={m.month} className="flex-1 text-center">
              {/* Every other month on narrow screens so labels never collide. */}
              <span className={i % 2 ? "hidden sm:inline" : ""}>{monthName(m.month, false)}</span>
            </span>
          ))}
        </div>
      </div>
      <details>
        <summary className="cursor-pointer text-sm text-muted-foreground">Show as a table</summary>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 font-normal">Month</th>
              <th className="py-1 text-right font-normal">In</th>
              <th className="py-1 text-right font-normal">Out</th>
              <th className="py-1 text-right font-normal">Net</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {trend.map((m) => (
              <tr key={m.month} className="border-t">
                <td className="py-1">{monthName(m.month)}</td>
                <td className="py-1 text-right">{money(m.moneyIn)}</td>
                <td className="py-1 text-right">{money(m.moneyOut)}</td>
                <td className="py-1 text-right">{money(m.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
