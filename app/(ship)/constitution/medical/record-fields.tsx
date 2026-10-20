import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { type Field, type Kind, KINDS, REMINDERS } from "@/lib/medical";

const area =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

/** The fields for an appointment, a result or a vaccination, filled from a saved one if given. */
export function RecordFields({ kind, values }: { kind: Kind; values: Record<string, string> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {(KINDS[kind].fields as readonly Field[]).map((f) => (
        <div key={f.name} className={`grid gap-1 ${f.type === "textarea" ? "sm:col-span-2" : ""}`}>
          <Label htmlFor={f.name}>{f.label}</Label>
          {f.type === "remind" ? (
            <NativeSelect id={f.name} name={f.name} defaultValue={values[f.name] ?? "1"} className="h-11 text-base">
              {REMINDERS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          ) : f.type === "textarea" ? (
            <textarea id={f.name} name={f.name} rows={3} defaultValue={values[f.name] ?? ""} placeholder={f.placeholder} className={area} />
          ) : (
            <Input
              id={f.name}
              name={f.name}
              type={f.type === "datetime" ? "datetime-local" : f.type === "minutes" ? "number" : f.type}
              min={f.type === "minutes" ? 5 : undefined}
              max={f.type === "minutes" ? 720 : undefined}
              step={f.type === "minutes" ? 5 : undefined}
              inputMode={f.type === "minutes" ? "numeric" : undefined}
              defaultValue={values[f.name] ?? (f.type === "minutes" ? "30" : "")}
              placeholder={f.placeholder}
              required={f.required}
              className="h-11 text-base"
            />
          )}
        </div>
      ))}
    </div>
  );
}
