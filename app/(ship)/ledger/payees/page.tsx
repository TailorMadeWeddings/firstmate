import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Category, type Period, addMonths, label, money, period, today } from "@/lib/ledger";
import { currentOwner } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";
import { renamePayee } from "../actions";
import { Filters, type Transaction, loadAccounts, loadCategories } from "../shared";

export const metadata: Metadata = { title: "Payees · Ledger · First Mate" };

type Search = { from?: string; to?: string; merchant?: string };

type Payee = {
  payee: string;
  merchants: string[];
  category_id: string | null;
  spent: number;
  transactions: number;
  months: number;
  first: string;
  last: string;
};

/** Seen in this many different months or more: a habit, not a one-off. */
const REGULAR_MONTHS = 3;

export default function PayeesPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Payees searchParams={searchParams} />
    </Suspense>
  );
}

async function Payees({ searchParams }: { searchParams: Promise<Search> }) {
  await currentOwner();
  const search = await searchParams;
  // The last 12 months unless asked otherwise: habits need a few months to show.
  const thisMonth = today().slice(0, 7);
  const p = period(search.from ?? addMonths(thisMonth, -11), search.to ?? thisMonth);
  const supabase = await createClient();
  const [categories, { data, error }] = await Promise.all([
    loadCategories(),
    supabase.rpc("budget_payee_spending", { p_from: `${p.from}-01`, p_to: lastDay(p.to) }),
  ]);
  if (error) throw error;
  const rows = data as Payee[];
  const regulars = rows.filter((r) => r.months >= REGULAR_MONTHS);
  const occasional = rows.filter((r) => r.months < REGULAR_MONTHS);
  const selected = search.merchant ? rows.find((r) => r.merchants.includes(search.merchant!)) : undefined;
  const link = (r: Payee) => `?${new URLSearchParams({ from: p.from, to: p.to, merchant: r.merchants[0] })}#payee`;
  // A year's cost from the months that have any spending in them, so a range
  // reaching back before the first import doesn't water it down.
  const earliest = rows.reduce((m, r) => (r.first < m ? r.first : m), p.to).slice(0, 7);
  const covered = Math.max(p.months.filter((m) => m >= earliest).length, 1);
  const perYear = (r: Payee) => (Number(r.spent) / covered) * 12;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <div className="flex items-baseline gap-3">
          <Link href="/ledger" className="text-sm text-muted-foreground hover:underline">
            ← Ledger
          </Link>
          <h1 className="text-2xl font-bold">Payees</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Where the money goes, shop by shop. Transfers between your own accounts aren&apos;t counted.
        </p>
      </header>

      <Filters period={p} />

      {search.merchant && (
        <section id="payee" className="scroll-mt-4">
          {selected ? (
            <Detail payee={selected} period={p} categories={categories} close={`?${new URLSearchParams({ from: p.from, to: p.to })}`} />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing from that payee in these months.</p>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-semibold">Regulars</h2>
          <p className="text-sm text-muted-foreground">
            Paid in {REGULAR_MONTHS} or more different months, by what they cost a year at this rate.
          </p>
        </div>
        {regulars.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None yet{p.months.length < REGULAR_MONTHS && `: pick ${REGULAR_MONTHS} months or more to see them`}.
          </p>
        ) : (
          <PayeeList rows={regulars} categories={categories} link={link} extra={(r) => `${money(perYear(r))} a year`} />
        )}
      </section>

      {occasional.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Occasional</h2>
          <PayeeList rows={occasional} categories={categories} link={link} />
        </section>
      )}
    </div>
  );
}

/** "2026-02" → "2026-02-28" */
const lastDay = (month: string) =>
  new Date(Date.parse(`${addMonths(month, 1)}-01`) - 86_400_000).toISOString().slice(0, 10);

function PayeeList({
  rows,
  categories,
  link,
  extra,
}: {
  rows: Payee[];
  categories: Category[];
  link: (r: Payee) => string;
  extra?: (r: Payee) => string;
}) {
  return (
    <ul className="divide-y rounded-xl border">
      {rows.map((r) => {
        const c = categories.find((x) => x.id === r.category_id);
        return (
          <li key={r.payee}>
            <Link href={link(r)} className="flex flex-col gap-0.5 px-4 py-3 hover:bg-muted">
              <span className="flex justify-between gap-3">
                <span className="truncate font-medium">{r.payee}</span>
                <span className="tabular-nums">{money(r.spent)}</span>
              </span>
              <span className="flex justify-between gap-3 text-xs text-muted-foreground">
                <span className="truncate">
                  {c ? label(c, categories) : "Uncategorised"} · {r.transactions}× · {r.months} month
                  {r.months === 1 ? "" : "s"} · avg {money(Number(r.spent) / r.transactions)}
                </span>
                {extra && <span className="whitespace-nowrap tabular-nums">{extra(r)}</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Every transaction behind one payee, and its name. */
async function Detail({
  payee,
  period: p,
  categories,
  close,
}: {
  payee: Payee;
  period: Period;
  categories: Category[];
  close: string;
}) {
  const supabase = await createClient();
  const [accounts, { data, error }] = await Promise.all([
    loadAccounts(),
    supabase
      .from("budget_transactions")
      .select("id, date, amount, description, notes, account_id, category_id, goal_id, transfer_id")
      .in("merchant", payee.merchants)
      .is("transfer_id", null)
      .is("goal_id", null)
      .gte("date", `${p.from}-01`)
      .lte("date", lastDay(p.to))
      .order("date", { ascending: false })
      .limit(200)
      .returns<Transaction[]>(),
  ]);
  if (error) throw error;

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">
          {payee.payee} · {money(payee.spent)}
        </h2>
        <Link href={close} className="text-sm text-muted-foreground hover:underline">
          Close
        </Link>
      </div>
      {payee.merchants.length > 1 && (
        <p className="text-xs text-muted-foreground">Together: {payee.merchants.join(", ")}</p>
      )}
      <ActionForm action={renamePayee.bind(null, payee.merchants)} reset={false} className="flex flex-wrap items-end gap-2">
        <div className="grid flex-1 gap-1">
          <label htmlFor="payee-name" className="text-sm">
            Name
          </label>
          <Input
            id="payee-name"
            name="name"
            defaultValue={payee.payee === payee.merchants[0] ? "" : payee.payee}
            placeholder={payee.merchants[0]}
          />
        </div>
        <Button size="sm" variant="secondary">
          Rename
        </Button>
      </ActionForm>
      <p className="text-xs text-muted-foreground">
        Give another payee the same name to see them together, like two Coles stores.
      </p>
      <ul className="divide-y text-sm">
        {data.map((t) => {
          const c = categories.find((x) => x.id === t.category_id);
          return (
            <li key={t.id}>
              <Link href={`/ledger/transactions/${t.id}`} className="flex justify-between gap-3 py-2 hover:underline">
                <span className="min-w-0 truncate">
                  {t.date}
                  <span className="text-muted-foreground">
                    {" "}
                    · {c ? label(c, categories) : "Uncategorised"} · {accounts.find((a) => a.id === t.account_id)?.name}
                    {t.notes && ` · ${t.notes}`}
                  </span>
                </span>
                <span className="tabular-nums">{money(t.amount)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {data.length === 200 && <p className="text-xs text-muted-foreground">Showing the latest 200.</p>}
    </div>
  );
}
