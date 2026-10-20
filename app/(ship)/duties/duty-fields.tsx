import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { type Duty, REPEATS } from "@/lib/duties";
import type { CrewMember } from "../logbook/data";

/** Who it's for: anyone, or one person (grown-up or child). */
export function WhoSelect({ crew, value, id = "who" }: { crew: CrewMember[]; value?: string | null; id?: string }) {
  return (
    <NativeSelect id={id} name="who" defaultValue={value ?? ""}>
      <option value="">Anyone</option>
      {crew.map((c) => (
        <option key={c.key} value={c.key}>
          {c.name}
        </option>
      ))}
    </NativeSelect>
  );
}

export function RepeatSelect({ value, id = "repeat" }: { value?: string | null; id?: string }) {
  return (
    <NativeSelect id={id} name="repeat" defaultValue={value ?? ""}>
      <option value="">Doesn&apos;t repeat</option>
      {Object.entries(REPEATS).map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </NativeSelect>
  );
}

/** Categories already in use, offered as you type (any new one works too). */
export function CategoryList({ categories }: { categories: string[] }) {
  return (
    <datalist id="duty-categories">
      {categories.map((c) => (
        <option key={c} value={c} />
      ))}
    </datalist>
  );
}

/** Every field, for changing a duty. */
export function DutyFields({ duty, crew, categories }: { duty: Duty; crew: CrewMember[]; categories: string[] }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-1">
        <Label htmlFor="title">What needs doing</Label>
        <Input id="title" name="title" defaultValue={duty.title} required maxLength={200} className="h-11 text-lg" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1">
          <Label htmlFor="due_on">Due (optional)</Label>
          <Input id="due_on" name="due_on" type="date" defaultValue={duty.due_on ?? ""} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="repeat">Repeats</Label>
          <RepeatSelect value={duty.repeat} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="who">For</Label>
          <WhoSelect crew={crew} value={duty.assignee} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor="category">Category (optional)</Label>
          <Input id="category" name="category" list="duty-categories" defaultValue={duty.category ?? ""} maxLength={40} placeholder="House, school, admin…" />
          <CategoryList categories={categories} />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="important" defaultChecked={duty.important} className="size-4" /> Important
        </label>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="notes">Notes (optional)</Label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          defaultValue={duty.notes ?? ""}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
        />
      </div>
    </div>
  );
}
