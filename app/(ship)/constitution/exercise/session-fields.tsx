import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** When, how long, how far (optional) and how it went. */
export function SessionFields({ date, time, minutes, distance, notes }: { date: string; time: string; minutes: number; distance?: number | null; notes?: string | null }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="grid gap-1">
          <Label htmlFor="date">Day</Label>
          <Input id="date" name="date" type="date" defaultValue={date} required />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="time">Started</Label>
          <Input id="time" name="time" type="time" defaultValue={time} required />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="minutes">Minutes</Label>
          <Input id="minutes" name="minutes" type="number" inputMode="numeric" min={1} max={1440} defaultValue={minutes} required />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="distance_km">Distance (km)</Label>
          <Input id="distance_km" name="distance_km" type="number" inputMode="decimal" step={0.01} min={0} defaultValue={distance ?? ""} placeholder="optional" />
        </div>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="notes">How it went (optional)</Label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={notes ?? ""}
          placeholder="Worked on ukemi; 18 holes, 92; 400 m freestyle…"
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
        />
      </div>
    </div>
  );
}
