"use client";

import { Check } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";

/**
 * A round tick: done at once on tap (the server catches up), tap again to
 * undo where that's allowed. `toggle` gets what it should become.
 */
export function Tick({ done, label, toggle, undo = true }: { done: boolean; label: string; toggle: (next: boolean) => Promise<string | null>; undo?: boolean }) {
  const [shown, setShown] = useOptimistic(done);
  const [, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        role="checkbox"
        aria-checked={shown}
        aria-label={label}
        disabled={shown && !undo}
        onClick={() =>
          start(async () => {
            setShown(!shown);
            setProblem(await toggle(!shown));
          })
        }
        className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          shown ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50 hover:border-primary"
        }`}
      >
        {shown && <Check className="size-4" strokeWidth={3} aria-hidden />}
      </button>
      {problem && (
        <span role="alert" className="text-xs text-red-600">
          {problem}
        </span>
      )}
    </span>
  );
}
