import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { formatMinutes } from "@/lib/exercise";
import { TZ, addDays, dayKey, describeRepeat, repeatOf, wallOf } from "@/lib/logbook";
import { currentMedicalMember } from "@/lib/players";
import { deleteActivity, deleteSchedule, saveActivity, saveSchedule } from "../../actions";
import { type Schedule, loadActivities, loadActivity } from "../../data";
import { DayPicker } from "../../day-picker";

export const metadata: Metadata = { title: "Activity · Exercise · First Mate" };

type Props = { params: Promise<{ id: string }> };

export default function ActivityPage(props: Props) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <ActivityView {...props} />
      </Suspense>
    </div>
  );
}

const hhmm = (d: Date) => {
  const w = wallOf(d);
  return `${String(w.h).padStart(2, "0")}:${String(w.min).padStart(2, "0")}`;
};
const when = (iso: string) =>
  new Intl.DateTimeFormat("en-AU", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** One repeating slot's fields: days, time, length, weekly or fortnightly, from and until. */
function ScheduleFields({ schedule, minutes }: { schedule?: Schedule; minutes: number }) {
  const e = schedule?.event;
  const start = e ? new Date(e.start_at) : null;
  const { repeat, days } = repeatOf(e?.recurrence_rule ?? null);
  const length = e ? Math.round((Date.parse(e.end_at) - Date.parse(e.start_at)) / 60000) : minutes;
  const id = schedule?.id ?? "new";
  return (
    <div className="flex flex-col gap-3">
      <DayPicker picked={days} legend="On" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="grid gap-1">
          <Label htmlFor={`time-${id}`}>At</Label>
          <Input id={`time-${id}`} name="time" type="time" required defaultValue={start ? hhmm(start) : "18:00"} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`minutes-${id}`}>Minutes</Label>
          <Input id={`minutes-${id}`} name="minutes" type="number" inputMode="numeric" min={5} max={600} required defaultValue={length} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`repeat-${id}`}>Every</Label>
          <NativeSelect id={`repeat-${id}`} name="repeat" defaultValue={repeat === "fortnightly" ? "fortnightly" : "weekly"}>
            <option value="weekly">Week</option>
            <option value="fortnightly">Fortnight</option>
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`until-${id}`}>Until (optional)</Label>
          <Input id={`until-${id}`} name="until" type="date" defaultValue={e?.recurrence_ends_at ? addDays(dayKey(new Date(e.recurrence_ends_at)), -1) : ""} />
        </div>
      </div>
      <input type="hidden" name="from" value={start ? dayKey(start) : dayKey(new Date())} />
    </div>
  );
}

async function ActivityView({ params }: Props) {
  await currentMedicalMember();
  const { id } = await params;
  const activity = await loadActivity(id);
  if (!activity) notFound();
  const { schedules, sessions } = await loadActivities(activity.person, dayKey(new Date()));
  const mine = schedules.filter((s) => s.activity_id === id);
  const history = sessions.filter((s) => s.activity_id === id);
  const back = `/constitution/exercise?person=${encodeURIComponent(activity.person)}`;

  return (
    <>
      <Link href={back} className="text-sm text-muted-foreground hover:underline">
        ← Exercise
      </Link>
      <h1 className="text-4xl">{activity.name}</h1>

      <ActionForm action={saveActivity.bind(null, id)} reset={false} className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
        <div className="grid min-w-40 flex-1 gap-1">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={activity.name} required maxLength={60} />
        </div>
        <div className="grid w-28 gap-1">
          <Label htmlFor="minutes">Usual minutes</Label>
          <Input id="minutes" name="minutes" type="number" inputMode="numeric" min={5} max={600} defaultValue={activity.minutes} />
        </div>
        <Button variant="secondary">Save</Button>
      </ActionForm>

      <section aria-labelledby="schedule" className="flex flex-col gap-3">
        <h2 id="schedule" className="font-serif text-2xl font-black">
          When it&apos;s on
        </h2>
        <p className="text-sm text-muted-foreground">Repeating times go on the Logbook as &ldquo;{activity.name}&rdquo;. Tick each one off after.</p>
        {mine.map((s) => (
          <div key={s.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
            <p className="text-sm font-semibold">{describeRepeat(s.event.recurrence_rule)}</p>
            <ActionForm action={saveSchedule.bind(null, id, s.id)} reset={false} className="flex flex-col gap-3">
              <ScheduleFields schedule={s} minutes={activity.minutes} />
              <div className="flex gap-2">
                <Button size="sm" variant="secondary">
                  Save
                </Button>
              </div>
            </ActionForm>
            <ActionForm action={deleteSchedule.bind(null, s.id)} confirm="Stop this repeating time? It comes off the Logbook. Sessions you've ticked off stay.">
              <Button size="sm" variant="ghost" className="text-red-600">
                <Trash2 aria-hidden /> Stop this time
              </Button>
            </ActionForm>
          </div>
        ))}
        <details className="rounded-2xl border border-dashed bg-card" open={mine.length === 0}>
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Add a repeating time</summary>
          <ActionForm action={saveSchedule.bind(null, id, null)} className="flex flex-col gap-3 border-t p-4">
            <ScheduleFields minutes={activity.minutes} />
            <Button className="self-start">Add to the Logbook</Button>
          </ActionForm>
        </details>
      </section>

      <section aria-labelledby="history" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="history" className="font-serif text-2xl font-black">
            Sessions
          </h2>
          <Button asChild size="sm" variant="secondary">
            <Link href={`/constitution/exercise/session/new?activity=${id}`}>Log a session</Link>
          </Button>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">None in the last year.</p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {history.map((s) => (
              <li key={s.id}>
                <Link href={`/constitution/exercise/session/${s.id}`} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 px-4 py-2.5 hover:bg-muted">
                  <span className="text-sm tabular-nums text-muted-foreground sm:w-56">{when(s.starts_at)}</span>
                  <span className="font-medium">{formatMinutes(s.minutes)}</span>
                  {s.distance_km !== null && <span className="text-sm">{s.distance_km} km</span>}
                  {s.notes && <span className="w-full truncate text-sm text-muted-foreground sm:w-auto sm:flex-1">{s.notes}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ActionForm action={deleteActivity.bind(null, id, activity.person)} confirm={`Delete ${activity.name}, its repeating times and every session logged?`}>
        <Button variant="outline" className="text-red-600">
          Delete {activity.name}
        </Button>
      </ActionForm>
    </>
  );
}
