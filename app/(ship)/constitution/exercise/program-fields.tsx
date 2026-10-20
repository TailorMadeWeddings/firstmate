import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { DayPicker } from "./day-picker";

export type ProgramValue = { name: string; exercise: string; unit: "reps" | "seconds"; goal: number; weekdays: readonly string[]; active?: boolean };

/** A program's settings: what, the goal, and which days you train. */
export function ProgramFields({ value, editing = false }: { value: ProgramValue; editing?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor="name">Program</Label>
          <Input id="name" name="name" defaultValue={value.name} required maxLength={60} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="exercise">Exercise</Label>
          <Input id="exercise" name="exercise" defaultValue={value.exercise} required maxLength={60} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1">
          <Label htmlFor="unit">Counted in</Label>
          <NativeSelect id="unit" name="unit" defaultValue={value.unit}>
            <option value="reps">Reps</option>
            <option value="seconds">Seconds (holds, like a plank)</option>
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="goal">Goal (in one go)</Label>
          <Input id="goal" name="goal" type="number" inputMode="numeric" min={1} max={10000} defaultValue={value.goal} required />
        </div>
      </div>
      <DayPicker picked={[...value.weekdays]} legend="Training days" />
      {editing && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={value.active ?? true} className="size-4" /> Active (untick to pause it)
        </label>
      )}
    </div>
  );
}
