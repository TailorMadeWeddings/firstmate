import type { Metadata } from "next";
import { CalendarDays, MapPin, Repeat as RepeatIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { TZ, addDays, dayKey, describeRepeat, repeatOf, wallOf } from "@/lib/logbook";
import { createClient } from "@/lib/supabase/server";
import { deleteEvent, saveEvent } from "../../actions";
import { currentCrew, loadCrew } from "../../data";
import { EventFields } from "../../event-fields";
import { Avatars } from "../../views";

export const metadata: Metadata = { title: "Event · Logbook · First Mate" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ at?: string }> };

export default function EventPage(props: Props) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <EventDetail {...props} />
    </Suspense>
  );
}

const hhmm = (d: Date) => {
  const w = wallOf(d);
  return `${String(w.h).padStart(2, "0")}:${String(w.min).padStart(2, "0")}`;
};

async function EventDetail({ params, searchParams }: Props) {
  const member = await currentCrew();
  const { id } = await params;
  const { at } = await searchParams;
  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, title, description, location, start_at, end_at, all_day, recurrence_rule, recurrence_ends_at")
    .eq("id", id)
    .maybeSingle();
  if (!event) notFound();
  // Which occurrence was opened (a repeating event's own start if none).
  const occurrence = at && !Number.isNaN(Date.parse(at)) ? new Date(at).toISOString() : null;
  const [crew, { data: change }, { data: assigned }] = await Promise.all([
    loadCrew(member.householdId),
    occurrence
      ? supabase
          .from("event_exceptions")
          .select("title, description, location, start_at, end_at")
          .eq("parent_event_id", id)
          .eq("original_start_at", occurrence)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("event_assignees").select("profile_id, dependent_id").eq("event_id", id),
  ]);

  const length = Date.parse(event.end_at) - Date.parse(event.start_at);
  const start = new Date(change?.start_at ?? occurrence ?? event.start_at);
  const end = change?.end_at ? new Date(change.end_at) : new Date(start.getTime() + length);
  const who = (assigned ?? []).map((a) => (a.profile_id ? `p:${a.profile_id}` : `d:${a.dependent_id}`));
  const repeating = Boolean(event.recurrence_rule);
  const { repeat, days } = repeatOf(event.recurrence_rule);
  const title = change?.title ?? event.title;
  const location = change?.location ?? event.location;
  const description = change?.description ?? event.description;
  const lastDay = dayKey(new Date(end.getTime() - 1));
  const when = event.all_day
    ? new Intl.DateTimeFormat("en-AU", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).formatRange(
        start,
        new Date(end.getTime() - 1),
      )
    : new Intl.DateTimeFormat("en-AU", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).formatRange(start, end);
  const back = `/logbook?date=${dayKey(start)}`;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href={back} className="text-sm text-muted-foreground hover:underline">
        ← Logbook
      </Link>

      <article className="flex flex-col gap-4 rounded-2xl border bg-card p-6">
        <h1 className="text-4xl">{title}</h1>
        <ul className="flex flex-col gap-2 text-sm">
          <li className="flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" aria-hidden /> {when}
          </li>
          {repeating && (
            <li className="flex items-center gap-2">
              <RepeatIcon className="size-4 text-muted-foreground" aria-hidden /> {describeRepeat(event.recurrence_rule)}
            </li>
          )}
          {location && (
            <li className="flex items-center gap-2">
              <MapPin className="size-4 text-muted-foreground" aria-hidden /> {location}
            </li>
          )}
        </ul>
        {who.length > 0 && (
          <div className="flex items-center gap-3">
            <Avatars keys={who} crew={crew} size="lg" />
            <span className="text-sm text-muted-foreground">
              {who.map((k) => crew.find((c) => c.key === k)?.name).filter(Boolean).join(", ")}
            </span>
          </div>
        )}
        {description && <p className="whitespace-pre-wrap text-sm">{description}</p>}
      </article>

      <details className="rounded-2xl border bg-card p-5">
        <summary className="cursor-pointer font-semibold">Change</summary>
        <ActionForm action={saveEvent.bind(null, id, repeating ? occurrence ?? event.start_at : null)} reset={false} className="mt-4 flex flex-col gap-6">
          <EventFields
            crew={crew}
            repeating={repeating}
            value={{
              title,
              day: dayKey(start),
              startTime: hhmm(start),
              endTime: hhmm(end),
              allDay: event.all_day,
              endDay: lastDay,
              repeat,
              days,
              until: event.recurrence_ends_at ? addDays(dayKey(new Date(event.recurrence_ends_at)), -1) : "",
              who,
              location: location ?? "",
              description: description ?? "",
            }}
          />
          <Button size="lg" className="self-start">
            Save changes
          </Button>
        </ActionForm>
      </details>

      <ActionForm
        action={deleteEvent.bind(null, id, repeating ? occurrence ?? event.start_at : null)}
        confirm={repeating ? "Delete the events you picked?" : `Delete ${title}?`}
        className="flex flex-wrap items-center gap-3"
      >
        {repeating && (
          <select name="scope" defaultValue="this" aria-label="Which to delete" className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="this">Just this one</option>
            <option value="following">This and the ones after</option>
            <option value="all">Every one</option>
          </select>
        )}
        <Button variant="outline" className="text-red-600">
          Delete
        </Button>
      </ActionForm>
    </div>
  );
}
