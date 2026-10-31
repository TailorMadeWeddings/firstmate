"use client";

import { Check } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { setChecked } from "./actions";

export type Item = { id: string; name: string; checked_at: string | null; recipes: { title: string } | null };

/** One thing to buy: tick it (it greys out at once; the server catches up). */
export function ItemRow({ item }: { item: Item }) {
  const [checked, setOptimisticChecked] = useOptimistic(item.checked_at !== null);
  const [, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const toggle = () =>
    start(async () => {
      setOptimisticChecked(!checked);
      setProblem(await setChecked(item.id, !checked));
    });

  return (
    <li className={checked ? "opacity-60" : ""}>
      <button
        type="button"
        onClick={toggle}
        role="checkbox"
        aria-checked={checked}
        className="flex w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition ${
            checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50"
          }`}
          aria-hidden
        >
          {checked && <Check className="size-4" strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block font-medium ${checked ? "line-through" : ""}`}>{item.name}</span>
          {item.recipes && <span className="block text-xs text-muted-foreground">For {item.recipes.title}</span>}
          {problem && (
            <span role="alert" className="block text-xs text-red-600">
              {problem}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
