import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { Person } from "../data";
import { area } from "../parts";

/** Who a story is about, a title, when it happened, and the story. */
export function StoryFields({ people, values }: { people: Person[]; values: { person?: string; title?: string | null; occurred_on?: string | null; body?: string } }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1">
        <Label htmlFor="person">About</Label>
        <NativeSelect id="person" name="person" defaultValue={values.person ?? ""} required className="h-11 text-base">
          <option value="" disabled>
            Pick someone
          </option>
          {people.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="occurred_on">When it happened (optional)</Label>
        <Input id="occurred_on" name="occurred_on" type="date" defaultValue={values.occurred_on ?? ""} className="h-11 text-base" />
      </div>
      <div className="grid gap-1 sm:col-span-2">
        <Label htmlFor="title">Title (optional)</Label>
        <Input id="title" name="title" defaultValue={values.title ?? ""} placeholder="The day you met the cows" className="h-11 text-base" />
      </div>
      <div className="grid gap-1 sm:col-span-2">
        <Label htmlFor="body">The story</Label>
        <textarea id="body" name="body" rows={8} defaultValue={values.body ?? ""} required className={area} />
      </div>
    </div>
  );
}
