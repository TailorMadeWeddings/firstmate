import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_PROMPT } from "@/lib/constitution";
import { currentHealthOwner } from "@/lib/players";
import { saveSettings } from "../actions";
import { loadHealth } from "../data";

export const metadata: Metadata = { title: "Settings · Constitution · First Mate" };

const area =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

export default function SettingsPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/constitution" className="text-sm text-muted-foreground hover:underline">
        ← Constitution
      </Link>
      <h1 className="text-3xl">Baseline, habits and check-in</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <SettingsForm />
      </Suspense>
    </div>
  );
}

async function SettingsForm() {
  await currentHealthOwner();
  const { profile, habits } = await loadHealth();
  if (!profile) redirect("/constitution");
  return (
    <ActionForm action={saveSettings} reset={false} className="flex flex-col gap-6 rounded-2xl border bg-card p-5">
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 font-semibold">Baseline</legend>
        <div className="grid gap-1">
          <Label htmlFor="baseline_date">Started</Label>
          <Input id="baseline_date" name="baseline_date" type="date" defaultValue={profile.baseline_date} required />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="baseline_waist_cm">Waist (cm)</Label>
          <Input id="baseline_waist_cm" name="baseline_waist_cm" type="number" inputMode="decimal" step={0.1} defaultValue={profile.baseline_waist_cm ?? ""} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="baseline_weight_kg">Weight (kg)</Label>
          <Input id="baseline_weight_kg" name="baseline_weight_kg" type="number" inputMode="decimal" step={0.05} defaultValue={profile.baseline_weight_kg ?? ""} />
        </div>
      </fieldset>
      <div className="grid gap-1">
        <Label htmlFor="habits">Habits, one per line: the habit, a colon, then the target</Label>
        <textarea id="habits" name="habits" rows={5} className={area} defaultValue={habits.filter((h) => h.active).map((h) => (h.target ? `${h.name}: ${h.target}` : h.name)).join("\n")} />
        <p className="text-xs text-muted-foreground">The check-in holds you to these.</p>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="checkin_prompt">Check-in instructions (optional)</Label>
        <textarea id="checkin_prompt" name="checkin_prompt" rows={14} className={`${area} font-mono text-xs md:text-xs`} defaultValue={profile.checkin_prompt ?? ""} placeholder={DEFAULT_PROMPT} />
        <p className="text-xs text-muted-foreground">
          How the weekly check-in should talk and what it should focus on. Leave it empty to use the built-in instructions (shown faintly above).
        </p>
      </div>
      <Button size="lg" className="self-start">
        Save
      </Button>
    </ActionForm>
  );
}
