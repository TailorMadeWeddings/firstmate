import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { type Category, forEntry, label, money } from "@/lib/ledger";
import { currentOwner } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";
import { reconcile } from "../actions";
import { loadCategories } from "../shared";

export const metadata: Metadata = { title: "Reconcile · Ledger · First Mate" };

type Pending = {
  merchant: string;
  transactions: number;
  total: number;
  first: string;
  last: string;
  example: string;
  /** The Ledger's memory ("payee") or Claude's guess, waiting to be confirmed. */
  suggested_by: "payee" | "claude" | null;
  /** A category id, or "transfer" for the household's own accounts. */
  suggestion: string | null;
};

export default function ReconcilePage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Reconcile />
    </Suspense>
  );
}

async function Reconcile() {
  await currentOwner();
  const supabase = await createClient();
  const [categories, { data, error }] = await Promise.all([
    loadCategories(),
    supabase
      .from("budget_pending")
      .select("merchant, transactions, total, first, last, example, suggested_by, suggestion")
      .order("transactions", { ascending: false })
      .order("merchant")
      .returns<Pending[]>(),
  ]);
  if (error) throw error;
  const choices = forEntry(categories, []);
  // Suggestions first: one tap each. Then new merchants, most transactions first.
  const suggested = data.filter((p) => p.suggestion);
  const unknown = data.filter((p) => !p.suggestion);
  const waiting = data.reduce((n, p) => n + p.transactions, 0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-baseline gap-3">
          <Link href="/ledger" className="text-sm text-muted-foreground hover:underline">
            ← Ledger
          </Link>
          <h1 className="text-2xl font-bold">Reconcile</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {waiting
            ? `${waiting} transaction${waiting === 1 ? "" : "s"} from ${data.length} merchant${data.length === 1 ? "" : "s"} to sort. Pick once per merchant: the Ledger remembers it for next time.`
            : "Everything is sorted."}
        </p>
      </header>

      {suggested.length > 0 && <Group title="Check these suggestions" rows={suggested} choices={choices} all={categories} />}
      {unknown.length > 0 && <Group title="New merchants" rows={unknown} choices={choices} all={categories} />}
    </div>
  );
}

function Group({ title, rows, choices, all }: { title: string; rows: Pending[]; choices: Category[]; all: Category[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">{title}</h2>
      <ul className="divide-y rounded-xl border">
        {rows.map((p) => (
          <li key={p.merchant} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="flex justify-between gap-3">
                <span className="truncate font-medium">
                  {p.merchant}
                  {p.suggested_by === "claude" && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">Claude&apos;s guess</span>
                  )}
                </span>
                <span className="tabular-nums">{money(p.total)}</span>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {p.transactions}× · {p.first === p.last ? p.first : `${p.first} to ${p.last}`} · {p.example}
              </p>
            </div>
            <ActionForm action={reconcile.bind(null, p.merchant)} className="flex gap-2">
              <NativeSelect
                name="category_id"
                aria-label={`Category for ${p.merchant}`}
                defaultValue={p.suggestion ?? ""}
                required
              >
                <option value="" disabled>
                  Choose…
                </option>
                <option value="transfer">↔ Own account transfer</option>
                {choices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon ? `${c.icon} ` : ""}
                    {label(c, all)}
                    {c.type === "income" ? " (in)" : ""}
                  </option>
                ))}
              </NativeSelect>
              <Button size="sm" variant={p.suggestion ? "default" : "secondary"}>
                {p.suggestion ? "Confirm" : "Save"}
              </Button>
            </ActionForm>
          </li>
        ))}
      </ul>
    </section>
  );
}
