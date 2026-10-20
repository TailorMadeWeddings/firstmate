import { WEEKDAYS, type Weekday } from "@/lib/logbook";

const LETTER: Record<Weekday, string> = { MO: "M", TU: "T", WE: "W", TH: "T", FR: "F", SA: "S", SU: "S" };
const NAME: Record<Weekday, string> = { MO: "Monday", TU: "Tuesday", WE: "Wednesday", TH: "Thursday", FR: "Friday", SA: "Saturday", SU: "Sunday" };

/** Seven round toggles, Monday first; each posts day_XX=on when picked. */
export function DayPicker({ picked, legend }: { picked: string[]; legend: string }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="flex gap-1.5">
        {WEEKDAYS.map((d) => (
          <label key={d} title={NAME[d]} className="cursor-pointer">
            <input type="checkbox" name={`day_${d}`} defaultChecked={picked.includes(d)} className="peer sr-only" />
            <span className="flex size-10 items-center justify-center rounded-full border text-sm font-semibold peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
              <span aria-hidden>{LETTER[d]}</span>
              <span className="sr-only">{NAME[d]}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
