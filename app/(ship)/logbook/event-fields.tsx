import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { type Repeat, WEEKDAYS, type Weekday } from "@/lib/logbook";
import type { CrewMember } from "./data";

export type EventValue = {
  title: string;
  day: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  endDay: string;
  repeat: Repeat;
  days: Weekday[];
  until: string;
  who: string[];
  location: string;
  description: string;
};

const DAY_LETTER: Record<Weekday, string> = { MO: "M", TU: "T", WE: "W", TH: "T", FR: "F", SA: "S", SU: "S" };
const DAY_NAME: Record<Weekday, string> = {
  MO: "Monday", TU: "Tuesday", WE: "Wednesday", TH: "Thursday", FR: "Friday", SA: "Saturday", SU: "Sunday",
};

/**
 * The event form's fields. Native date and time pickers (touch-friendly on
 * phones); times hide for all-day events and weekdays show only for weekly
 * repeats, both in CSS (:has), so no script is needed.
 */
export function EventFields({ crew, value, repeating }: { crew: CrewMember[]; value: EventValue; repeating: boolean }) {
  return (
    <div className="group/form flex flex-col gap-5">
      {repeating && (
        <fieldset className="flex flex-col gap-2 rounded-xl border bg-muted/40 p-3">
          <legend className="px-1 text-sm font-semibold">This repeats. Change…</legend>
          {(
            [
              ["this", "Just this one (who it's for stays the same)"],
              ["following", "This one and the ones after"],
              ["all", "Every one"],
            ] as const
          ).map(([scope, text]) => (
            <label key={scope} className="flex items-center gap-2 text-sm">
              <input type="radio" name="scope" value={scope} defaultChecked={scope === "this"} className="size-4" />
              {text}
            </label>
          ))}
        </fieldset>
      )}

      <div className="grid gap-1">
        <Label htmlFor="title">What</Label>
        <Input id="title" name="title" defaultValue={value.title} placeholder="Swimming lessons" required autoFocus={!value.title} className="h-11 text-lg" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1">
          <Label htmlFor="date">Date</Label>
          <Input id="date" name="date" type="date" defaultValue={value.day} required />
        </div>
        <div className="grid gap-1 group-has-[#all_day:checked]/form:hidden">
          <Label htmlFor="start_time">From</Label>
          <Input id="start_time" name="start_time" type="time" step={300} defaultValue={value.startTime} />
        </div>
        <div className="grid gap-1 group-has-[#all_day:checked]/form:hidden">
          <Label htmlFor="end_time">To</Label>
          <Input id="end_time" name="end_time" type="time" step={300} defaultValue={value.endTime} />
        </div>
        <div className="hidden gap-1 group-has-[#all_day:checked]/form:grid">
          <Label htmlFor="end_date">Last day</Label>
          <Input id="end_date" name="end_date" type="date" defaultValue={value.endDay} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input id="all_day" type="checkbox" name="all_day" defaultChecked={value.allDay} className="size-4" />
        All day
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor="repeat">Repeats</Label>
          <NativeSelect id="repeat" name="repeat" defaultValue={value.repeat}>
            <option value="none">Doesn&apos;t repeat</option>
            <option value="daily">Every day</option>
            <option value="weekly">Every week</option>
            <option value="fortnightly">Every fortnight</option>
            <option value="monthly">Every month</option>
            <option value="yearly">Every year</option>
          </NativeSelect>
        </div>
        <div className="grid gap-1 group-has-[option[value=none]:checked]/form:hidden">
          <Label htmlFor="until">Until (optional)</Label>
          <Input id="until" name="until" type="date" defaultValue={value.until} />
        </div>
      </div>
      <fieldset className="hidden flex-col gap-2 group-has-[option[value=fortnightly]:checked]/form:flex group-has-[option[value=weekly]:checked]/form:flex">
        <legend className="mb-1 text-sm font-medium">On</legend>
        <div className="flex gap-1.5">
          {WEEKDAYS.map((d) => (
            <label key={d} title={DAY_NAME[d]} className="cursor-pointer">
              <input type="checkbox" name={`day_${d}`} defaultChecked={value.days.includes(d)} className="peer sr-only" />
              <span className="flex size-10 items-center justify-center rounded-full border text-sm font-semibold peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                <span aria-hidden>{DAY_LETTER[d]}</span>
                <span className="sr-only">{DAY_NAME[d]}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">None picked means the same weekday as the date.</p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Who</legend>
        <div className="flex flex-wrap gap-2">
          {crew.map((c) => (
            <label key={c.key} className="cursor-pointer">
              <input type="checkbox" name="who" value={c.key} defaultChecked={value.who.includes(c.key)} className="peer sr-only" />
              <span className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition peer-checked:border-foreground peer-checked:bg-foreground/5 peer-checked:font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                <span className="size-3 rounded-full" style={{ background: c.color }} aria-hidden />
                {c.name}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor="location">Where (optional)</Label>
          <Input id="location" name="location" defaultValue={value.location} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="description">Notes (optional)</Label>
          <Input id="description" name="description" defaultValue={value.description} />
        </div>
      </div>
    </div>
  );
}
