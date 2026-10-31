"use client";

import { Minus, Plus, ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { type Ingredient, formatQuantity, scaled, unitFor } from "@/lib/galley";
import { addRecipe } from "../shopping/actions";

/** The ingredient list, recalculated for however many people you're feeding; the crew can send it to the shopping list. */
export function Ingredients({ ingredients, servings, shop }: { ingredients: Ingredient[]; servings: number | null; shop?: string }) {
  const base = servings ?? 1;
  const [serves, setServes] = useState(base);
  const [pending, start] = useTransition();
  const [added, setAdded] = useState<string | null>(null);
  const toShop = (recipeId: string) =>
    start(async () => {
      setAdded((await addRecipe(recipeId, serves)) ?? "added");
    });
  const button =
    "flex size-9 items-center justify-center rounded-full border bg-card hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-2xl font-black">Ingredients</h2>
        {servings && (
          <div className="flex items-center gap-2" role="group" aria-label="Servings">
            <button type="button" className={button} onClick={() => setServes((s) => Math.max(1, s - 1))} disabled={serves <= 1} aria-label="Fewer servings">
              <Minus className="size-4" aria-hidden />
            </button>
            <span className="min-w-20 text-center text-sm" aria-live="polite">
              Serves <span className="font-semibold">{serves}</span>
            </span>
            <button type="button" className={button} onClick={() => setServes((s) => Math.min(100, s + 1))} aria-label="More servings">
              <Plus className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
      <ul className="divide-y rounded-2xl border bg-card">
        {ingredients.map((i, n) => (
          <li key={n} className="flex gap-3 px-4 py-2.5">
            <span className="w-20 shrink-0 text-right font-semibold tabular-nums">
              {i.quantity !== null && formatQuantity(scaled(i.quantity, base, serves))}{" "}
              {unitFor(i.unit, i.quantity === null ? null : scaled(i.quantity, base, serves))}
            </span>
            <span>
              {i.name}
              {i.notes && <span className="text-muted-foreground">, {i.notes}</span>}
            </span>
          </li>
        ))}
      </ul>
      {shop && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => toShop(shop)}
            disabled={pending}
            className="flex h-10 items-center gap-2 rounded-lg border bg-card px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ShoppingBasket className="size-4" aria-hidden /> Add to shopping list
          </button>
          {added === "added" ? (
            <Link href="/galley/shopping" className="text-sm font-semibold text-primary hover:underline dark:text-blue-400" aria-live="polite">
              Added. See the list
            </Link>
          ) : (
            added && (
              <span role="alert" className="text-sm text-red-600">
                {added}
              </span>
            )
          )}
        </div>
      )}
    </section>
  );
}
