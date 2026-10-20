"use client";

import { Check, NotebookText, Repeat as RepeatIcon, Star } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { type Duty, REPEATS } from "@/lib/duties";
import { textOn } from "@/lib/logbook";
import { setDone } from "./actions";

type Person = { name: string; color: string };

/** One duty: tick it off (it greys out at once; the server catches up), or open it to change it. */
export function DutyRow({ duty, due, overdue, person }: { duty: Duty; due: string | null; overdue: boolean; person: Person | null }) {
  const [done, setOptimisticDone] = useOptimistic(duty.done_at !== null);
  const [, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const toggle = () =>
    start(async () => {
      setOptimisticDone(!done);
      setProblem(await setDone(duty.id, !done));
    });

  return (
    <li className={`flex items-center gap-3 px-4 py-3 ${done ? "opacity-60" : ""}`}>
      <button
        type="button"
        onClick={toggle}
        role="checkbox"
        aria-checked={done}
        aria-label={`${duty.title}: ${done ? "done" : "not done"}`}
        className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50 hover:border-primary"
        }`}
      >
        {done && <Check className="size-4" strokeWidth={3} aria-hidden />}
      </button>
      <Link href={`/duties/${duty.id}`} className="min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className={`block truncate font-medium ${done ? "line-through" : ""}`}>{duty.title}</span>
        {(due || duty.repeat || duty.category || duty.notes) && (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {due && <span className={overdue && !done ? "font-semibold text-red-600 dark:text-red-400" : ""}>{due}</span>}
            {duty.repeat && (
              <span className="flex items-center gap-0.5">
                <RepeatIcon className="size-3" aria-hidden /> {REPEATS[duty.repeat]}
              </span>
            )}
            {duty.category && <span className="rounded-full bg-muted px-2 py-px text-foreground/80">{duty.category}</span>}
            {duty.notes && <NotebookText className="size-3" aria-label="Has notes" />}
          </span>
        )}
        {problem && (
          <span role="alert" className="block text-xs text-red-600">
            {problem}
          </span>
        )}
      </Link>
      {duty.important && <Star className="size-4 shrink-0 fill-amber-400 text-amber-500" aria-label="Important" />}
      {person && (
        <span
          title={person.name}
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
          style={{ background: person.color, color: textOn(person.color) }}
        >
          <span aria-hidden>{person.name.slice(0, 1).toUpperCase()}</span>
          <span className="sr-only">For {person.name}</span>
        </span>
      )}
    </li>
  );
}
