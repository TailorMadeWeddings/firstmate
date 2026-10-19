"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { type Ingredient, formatQuantity, scaled, unitFor } from "@/lib/galley";

/** The ingredient list, recalculated for however many people you're feeding. */
export function Ingredients({ ingredients, servings }: { ingredients: Ingredient[]; servings: number | null }) {
  const base = servings ?? 1;
  const [serves, setServes] = useState(base);
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
    </section>
  );
}
