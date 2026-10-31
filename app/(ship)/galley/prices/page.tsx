import type { Metadata } from "next";
import { ArrowLeft, ChevronRight, Receipt } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { currentCrew } from "@/lib/players";
import { STORES, type Store, type Unit, mainUnit, money, unitMoney } from "@/lib/prices";
import { createClient } from "@/lib/supabase/server";
import { changeSearch, followIngredient, unfollow } from "./actions";

export const metadata: Metadata = { title: "Prices · Galley · First Mate" };

type Item = { id: string; name: string; search: string; created_by: string };
type Summary = {
  item_id: string; store: Store; unit: Unit; usual: number; lowest: number; days: number;
  product: string; size: string | null; price: number; was_price: number | null; unit_price: number; seen_on: string;
};

const when = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });

export default function PricesPage() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Prices />
      </Suspense>
    </div>
  );
}

async function Prices() {
  const member = await currentCrew();
  const supabase = await createClient();
  const [items, summary] = await Promise.all([
    supabase.from("price_items").select("id, name, search, created_by").order("name"),
    supabase.from("price_summary").select("item_id, store, unit, usual, lowest, days, product, size, price, was_price, unit_price, seen_on"),
  ]);
  if (items.error) throw items.error;
  if (summary.error) throw summary.error;
  const all = (summary.data as Summary[]).map((r) => ({ ...r, usual: Number(r.usual), lowest: Number(r.lowest), price: Number(r.price), unit_price: Number(r.unit_price) }));

  return (
    <>
      <header className="flex flex-col gap-1">
        <Link href="/galley" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Galley
        </Link>
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Galley</p>
        <h1 className="text-4xl">Prices</h1>
        <p className="max-w-prose text-muted-foreground">
          What groceries usually cost. Coles, Woolworths, Aldi and Harris Farm are checked every morning. Costco doesn&apos;t list its warehouse
          prices online, so give Claude a photo of the receipt and it fills them in.
        </p>
      </header>

      <ActionForm action={followIngredient} className="flex flex-wrap items-end gap-2 rounded-2xl border bg-card p-4">
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
          Ingredient
          <Input name="name" placeholder="Full cream milk" required maxLength={80} />
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
          <span>
            Search the shops for <span className="text-muted-foreground">(if different)</span>
          </span>
          <Input name="search" placeholder="full cream milk 2l" maxLength={80} />
        </label>
        <Button>Follow</Button>
      </ActionForm>

      {(items.data as Item[]).length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <p className="font-serif text-2xl italic text-muted-foreground">No ingredients followed yet.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            <Receipt className="mr-1 inline size-4" aria-hidden />
            Or hand Claude a Costco receipt: the ingredients on it are followed from then on.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {(items.data as Item[]).map((item) => {
            const mine = all.filter((r) => r.item_id === item.id);
            const unit = mainUnit(mine);
            const stores = mine.filter((r) => r.unit === unit).sort((a, b) => a.unit_price - b.unit_price);
            const canStop = member.role === "owner" || item.created_by === member.id;
            return (
              <li key={item.id}>
                <details className="group rounded-2xl border bg-card shadow-sm">
                  <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-4 gap-y-1 p-4">
                    <ChevronRight className="size-4 self-center text-muted-foreground transition group-open:rotate-90" aria-hidden />
                    <span className="font-serif text-xl font-black">{item.name}</span>
                    {stores.length === 0 ? (
                      <span className="text-sm text-muted-foreground">No prices yet</span>
                    ) : (
                      <span className="flex flex-wrap gap-x-3 text-sm">
                        {stores.map((s, i) => (
                          <span key={s.store} className={i === 0 ? "font-semibold" : "text-muted-foreground"}>
                            {STORES[s.store]} <span className="tabular-nums">{unitMoney(s.unit_price, s.unit)}</span>
                          </span>
                        ))}
                      </span>
                    )}
                  </summary>
                  <div className="flex flex-col gap-4 border-t p-4">
                    {stores.length > 0 && (
                      <div className="-mx-4 overflow-x-auto px-4">
                        <table className="w-full min-w-[36rem] text-sm">
                          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                            <tr>
                              <th className="py-1 pr-3 font-semibold">Store</th>
                              <th className="py-1 pr-3 font-semibold">Latest</th>
                              <th className="py-1 pr-3 text-right font-semibold">Usual</th>
                              <th className="py-1 pr-3 text-right font-semibold">Lowest</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stores.map((s) => (
                              <tr key={s.store} className="border-t align-top">
                                <td className="py-2 pr-3 font-semibold">{STORES[s.store]}</td>
                                <td className="py-2 pr-3">
                                  <span className="tabular-nums">{money(s.price)}</span>
                                  {s.was_price && <span className="ml-1 text-xs text-muted-foreground line-through">{money(Number(s.was_price))}</span>}{" "}
                                  <span className="text-muted-foreground">
                                    {s.product} · {unitMoney(s.unit_price, s.unit)} · {when(s.seen_on)}
                                  </span>
                                </td>
                                <td className="py-2 pr-3 text-right tabular-nums">{unitMoney(s.usual, s.unit)}</td>
                                <td className="py-2 pr-3 text-right tabular-nums" title={`Seen on ${s.days} day${s.days === 1 ? "" : "s"} this year`}>
                                  {unitMoney(s.lowest, s.unit)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <Link href={`/galley/prices/${item.id}`} className="text-sm font-semibold text-primary hover:underline dark:text-blue-400">
                        Every price, day by day
                      </Link>
                      <div className="flex flex-wrap items-end gap-2">
                        <ActionForm action={changeSearch.bind(null, item.id)} reset={false} className="flex items-end gap-2">
                          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                            Searched as
                            <Input name="search" defaultValue={item.search} required maxLength={80} className="h-8 w-48 text-sm" />
                          </label>
                          <Button size="sm" variant="outline">
                            Search again
                          </Button>
                        </ActionForm>
                        {canStop && (
                          <ActionForm action={unfollow.bind(null, item.id)} confirm={`Stop following ${item.name}? Its price history goes too.`}>
                            <Button size="sm" variant="ghost" className="text-red-600">
                              Stop following
                            </Button>
                          </ActionForm>
                        )}
                      </div>
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
