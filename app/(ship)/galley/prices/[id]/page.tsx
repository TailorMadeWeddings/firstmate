import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TrendChart, type TrendPoint } from "@/app/(ship)/constitution/trend-chart";
import { currentCrew } from "@/lib/players";
import { STORES, type Store, UNIT_LABEL, type Unit, mainUnit, money, unitMoney } from "@/lib/prices";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Price history · Galley · First Mate" };

type Price = {
  store: Store; product: string; size: string | null; price: number; was_price: number | null;
  unit_price: number | null; unit: Unit | null; seen_on: string; source: "pull" | "receipt";
};

export default function PriceHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <History params={params} />
      </Suspense>
    </div>
  );
}

async function History({ params }: { params: Promise<{ id: string }> }) {
  await currentCrew();
  const { id } = await params;
  const supabase = await createClient();
  const [item, found] = await Promise.all([
    supabase.from("price_items").select("name, search").eq("id", id).maybeSingle(),
    // ponytail: the latest 1000 (about three months of four stores); page back if anyone wants years.
    supabase.from("prices").select("store, product, size, price, was_price, unit_price, unit, seen_on, source").eq("item_id", id).order("seen_on", { ascending: false }).order("store").limit(1000),
  ]);
  if (!item.data) notFound();
  if (found.error) throw found.error;
  const prices = (found.data as Price[]).map((p) => ({ ...p, price: Number(p.price), unit_price: p.unit_price === null ? null : Number(p.unit_price) }));
  const unit = mainUnit(prices);

  // The cheapest per kg/L/each each day, with each store's cheapest beneath it.
  const byDay = new Map<string, typeof prices>();
  for (const p of prices) if (unit && p.unit === unit) byDay.set(p.seen_on, [...(byDay.get(p.seen_on) ?? []), p]);
  const points: TrendPoint[] = [...byDay]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, ps]) => {
      const cheapest = new Map<Store, (typeof ps)[number]>();
      for (const p of ps) if (!cheapest.has(p.store) || p.unit_price! < cheapest.get(p.store)!.unit_price!) cheapest.set(p.store, p);
      const list = [...cheapest.values()].sort((a, b) => a.unit_price! - b.unit_price!);
      return { date, value: Math.round(list[0].unit_price! * 100) / 100, detail: list.map((p) => `${STORES[p.store]}: ${unitMoney(p.unit_price!, unit!)} (${p.product})`) };
    });

  return (
    <>
      <header className="flex flex-col gap-1">
        <Link href="/galley/prices" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Prices
        </Link>
        <h1 className="text-4xl">{item.data.name}</h1>
        <p className="text-sm text-muted-foreground">Searched as &ldquo;{item.data.search}&rdquo;</p>
      </header>

      {unit && (
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Cheapest per {UNIT_LABEL[unit]}, day by day</h2>
          <TrendChart label={`Cheapest per ${UNIT_LABEL[unit]}`} unit={`$/${UNIT_LABEL[unit]}`} points={points} baseline={null} height={220} tone="primary" per="day" />
        </section>
      )}

      {prices.length === 0 ? (
        <p className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">No prices yet. The shops are checked every morning.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-semibold">Day</th>
                <th className="py-1 pr-3 font-semibold">Store</th>
                <th className="py-1 pr-3 font-semibold">Product</th>
                <th className="py-1 pr-3 text-right font-semibold">Price</th>
                <th className="py-1 pr-3 text-right font-semibold">Per unit</th>
              </tr>
            </thead>
            <tbody>
              {prices.map((p, i) => (
                <tr key={i} className="border-t">
                  <td className="py-1.5 pr-3 tabular-nums">{p.seen_on}</td>
                  <td className="py-1.5 pr-3">
                    {STORES[p.store]}
                    {p.source === "receipt" && <span className="ml-1 text-xs text-muted-foreground">receipt</span>}
                  </td>
                  <td className="py-1.5 pr-3">{p.product}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {p.was_price && <span className="mr-1 text-xs text-muted-foreground line-through">{money(Number(p.was_price))}</span>}
                    {money(p.price)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{p.unit_price !== null && p.unit ? unitMoney(p.unit_price, p.unit) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
