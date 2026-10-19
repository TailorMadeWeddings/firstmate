import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { dayKey } from "@/lib/logbook";
import { saveEvent } from "../actions";
import { currentCrew, loadCrew } from "../data";
import { EventFields } from "../event-fields";

export const metadata: Metadata = { title: "New event · Logbook · First Mate" };

export default function NewEventPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <NewEvent searchParams={searchParams} />
    </Suspense>
  );
}

async function NewEvent({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const member = await currentCrew();
  const { date } = await searchParams;
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : dayKey(new Date());
  const crew = await loadCrew(member.householdId);
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex items-baseline gap-3">
        <Link href={`/logbook?date=${day}`} className="text-sm text-muted-foreground hover:underline">
          ← Logbook
        </Link>
        <h1 className="text-3xl">New event</h1>
      </header>
      <ActionForm action={saveEvent.bind(null, null, null)} reset={false} className="flex flex-col gap-6 rounded-2xl border bg-card p-5">
        <EventFields
          crew={crew}
          repeating={false}
          value={{
            title: "",
            day,
            startTime: "09:00",
            endTime: "10:00",
            allDay: false,
            endDay: day,
            repeat: "none",
            days: [],
            until: "",
            who: [],
            location: "",
            description: "",
          }}
        />
        <Button size="lg" className="self-start">
          Add to the Logbook
        </Button>
      </ActionForm>
    </div>
  );
}
