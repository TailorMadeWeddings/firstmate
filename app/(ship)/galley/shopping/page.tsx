import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { LiveRefresh } from "@/components/live-refresh";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { currentCrew } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";
import { addItem, clearChecked } from "./actions";
import { type Item, ItemRow } from "./item-row";

export const metadata: Metadata = { title: "Shopping list · Galley · First Mate" };

export default function ShoppingPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/galley" className="text-sm text-muted-foreground hover:underline">
        ← Galley
      </Link>
      <header className="flex flex-col gap-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Galley</p>
        <h1 className="text-4xl">Shopping list</h1>
      </header>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  await currentCrew();
  const supabase = await createClient();
  const { data, error } = await supabase.from("shopping_items").select("id, name, checked_at, recipes(title)").order("created_at");
  if (error) throw error;
  const items = data as unknown as Item[];
  const open = items.filter((i) => !i.checked_at);
  const ticked = items.filter((i) => i.checked_at);

  return (
    <>
      <LiveRefresh channel="shopping" tables={["shopping_items"]} />

      <ActionForm action={addItem} className="flex gap-2 rounded-2xl border bg-card p-4 shadow-sm">
        <Input name="name" placeholder="Add something…" aria-label="What to buy" required maxLength={200} className="h-11 flex-1 text-base" />
        <Button size="lg" className="h-11">
          <Plus aria-hidden /> Add
        </Button>
      </ActionForm>

      {items.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <p className="font-serif text-2xl italic text-muted-foreground">The larder&apos;s stocked: nothing to buy.</p>
          <p className="mt-2 text-sm text-muted-foreground">Add things above, or a recipe&apos;s ingredients from its page.</p>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {[...open, ...ticked].map((i) => (
            <ItemRow key={i.id} item={i} />
          ))}
        </ul>
      )}

      {ticked.length > 0 && (
        <ActionForm action={clearChecked} className="self-start">
          <Button variant="outline">Clear {ticked.length} ticked</Button>
        </ActionForm>
      )}
    </>
  );
}
