"use client";

import { useRef } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type HealthEntry, MEASURES, type Measure } from "@/lib/constitution";

/**
 * The weekly entry: phone-first, big inputs, and a one-tap "last time" for
 * the numbers that barely change. Only the date is required.
 */
export function EntryForm({
  action,
  entry,
  date,
  last,
}: {
  action: (prev: string | null, form: FormData) => Promise<string | null>;
  entry?: HealthEntry;
  date: string;
  last: Partial<Record<Measure, number>>;
}) {
  const inputs = useRef(new Map<string, HTMLInputElement>());
  return (
    <ActionForm action={action} reset={false} className="flex flex-col gap-5 rounded-2xl border bg-card p-5">
      <div className="grid gap-1">
        <Label htmlFor="entry_date">Week ending</Label>
        <Input id="entry_date" name="entry_date" type="date" defaultValue={entry?.entry_date ?? date} required className="h-11 text-base" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {MEASURES.map((m) => (
          <div key={m.key} className={`grid gap-1 ${m.key === "waist_cm" ? "sm:col-span-2" : ""}`}>
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor={m.key} className={m.key === "waist_cm" ? "text-base font-semibold" : ""}>
                {m.label}
                {m.key === "waist_cm" && <span className="ml-2 text-xs font-normal text-muted-foreground">the honest one</span>}
              </Label>
              {last[m.key] !== undefined && !entry && (
                <button
                  type="button"
                  onClick={() => {
                    const input = inputs.current.get(m.key);
                    if (input) input.value = String(last[m.key]);
                  }}
                  className="rounded-full px-2 py-0.5 text-xs font-semibold text-primary hover:bg-muted dark:text-blue-400"
                  aria-label={`Use last time's ${m.label.toLowerCase()}: ${last[m.key]}`}
                >
                  Last: {last[m.key]}
                </button>
              )}
            </div>
            <Input
              ref={(el) => {
                if (el) inputs.current.set(m.key, el);
              }}
              id={m.key}
              name={m.key}
              type="number"
              inputMode={m.step === 1 ? "numeric" : "decimal"}
              step={m.step}
              min={0}
              max={m.max}
              defaultValue={entry?.[m.key] ?? ""}
              className={m.key === "waist_cm" ? "h-14 text-2xl font-semibold" : "h-11 text-base"}
            />
          </div>
        ))}
      </div>
      <div className="grid gap-1">
        <Label htmlFor="notes">Notes (optional)</Label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={entry?.notes ?? ""}
          placeholder="How the week went: sleep, stress, a sore back, a big dinner…"
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      <Button size="lg" className="h-12 self-stretch text-base sm:self-start">
        {entry ? "Save changes" : "Save this week"}
      </Button>
    </ActionForm>
  );
}
