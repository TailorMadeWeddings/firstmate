import type { Metadata } from "next";
import { Lock, NotebookText, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type HealthEntry, MEASURES, type Measure, byDate, change, latest, nextStrengthSession } from "@/lib/constitution";
import { dayKey } from "@/lib/logbook";
import { currentHealthOwner } from "@/lib/players";
import { startTracking } from "./actions";
import { CheckinPanel } from "./checkin-panel";
import { ConstitutionTabs } from "./tabs";
import { loadHealth } from "./data";
import { type TrendPoint, TrendChart } from "./trend-chart";

export const metadata: Metadata = { title: "Constitution · First Mate" };

type Search = { checkin?: string };

export default function ConstitutionPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Constitution</p>
          <h1 className="text-4xl">Health and habits</h1>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Lock className="size-3.5" aria-hidden /> Only you can see this. Not even the other Captain.
          </p>
        </div>
        <ConstitutionTabs current="fitness" />
      </header>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Constitution searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Every other number on an entry, for the chart's tooltip. */
const details = (e: HealthEntry, skip: Measure) =>
  MEASURES.filter((m) => m.key !== skip && e[m.key] !== null).map((m) => `${m.label}: ${e[m.key]}${m.unit === "cm" || m.unit === "kg" ? ` ${m.unit}` : ""}`).concat(e.notes ? [`“${e.notes.slice(0, 120)}”`] : []);

const series = (entries: HealthEntry[], key: Measure): TrendPoint[] =>
  entries.filter((e) => e[key] !== null).map((e) => ({ date: e.entry_date, value: e[key]!, detail: details(e, key) }));

async function Constitution({ searchParams }: { searchParams: Promise<Search> }) {
  await currentHealthOwner();
  const search = await searchParams;
  const { profile, entries: unsorted, habits, checkins } = await loadHealth();

  if (!profile) return <StartTracking />;

  const entries = byDate(unsorted);
  const waist = latest(entries, "waist_cm");
  const weight = latest(entries, "weight_kg");
  const strength = nextStrengthSession(entries);
  const recent = entries.slice(-12);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="lg">
          <Link href="/constitution/new">
            <Plus aria-hidden /> Add this week
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/constitution/settings">
            <Settings aria-hidden /> Baseline, habits and check-in
          </Link>
        </Button>
      </div>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Where things stand">
        <Stat label="Waist" unit="cm" now={waist.now} since={change(profile.baseline_waist_cm, waist.now)} week={change(waist.before, waist.now)} hero />
        <Stat label="Weight" unit="kg" now={weight.now} since={change(profile.baseline_weight_kg, weight.now)} week={change(weight.before, weight.now)} />
        <div className="flex flex-col justify-between gap-2 rounded-2xl border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Next strength session</p>
          <p className="font-serif text-5xl font-black">{strength.next}</p>
          <p className="text-xs text-muted-foreground">{strength.total} sessions logged since {fmt(profile.baseline_date)}</p>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border bg-card p-5" aria-labelledby="waist-chart">
        <h2 id="waist-chart" className="font-serif text-2xl font-black">
          Waist <span className="font-sans text-sm font-normal text-muted-foreground">cm, the honest measure</span>
        </h2>
        <TrendChart
          label="Waist"
          unit="cm"
          points={series(entries, "waist_cm")}
          baseline={profile.baseline_waist_cm !== null ? { date: profile.baseline_date, value: profile.baseline_waist_cm } : null}
          height={260}
          tone="primary"
        />
      </section>
      <section className="flex flex-col gap-2 rounded-2xl border bg-card p-5" aria-labelledby="weight-chart">
        <h2 id="weight-chart" className="font-serif text-xl font-black">
          Weight <span className="font-sans text-sm font-normal text-muted-foreground">kg, for context</span>
        </h2>
        <TrendChart
          label="Weight"
          unit="kg"
          points={series(entries, "weight_kg")}
          baseline={profile.baseline_weight_kg !== null ? { date: profile.baseline_date, value: profile.baseline_weight_kg } : null}
          height={170}
          tone="muted"
        />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="habits">
        <h2 id="habits" className="font-serif text-2xl font-black">Habits</h2>
        {habits.some((h) => h.active) && (
          <ul className="flex flex-wrap gap-2 text-sm">
            {habits.filter((h) => h.active).map((h) => (
              <li key={h.id} className="rounded-full border bg-card px-3 py-1">
                <span className="font-medium">{h.name}</span>
                {h.target && <span className="text-muted-foreground"> · {h.target}</span>}
              </li>
            ))}
          </ul>
        )}
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(["avg_cokes_per_day", "avg_water_per_day", "avg_daily_steps", "golf_rounds", "strength_sessions"] as const).map((key) => (
            <Habit key={key} measure={key} entries={recent} />
          ))}
        </ul>
      </section>

      <CheckinPanel checkins={checkins} autoStart={search.checkin === "1"} ready={entries.length > 0} />

      <section className="flex flex-col gap-3" aria-labelledby="entries">
        <h2 id="entries" className="font-serif text-2xl font-black">Every week</h2>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Week ending</th>
                  {MEASURES.map((m) => (
                    <th key={m.key} className="px-2 py-2 text-right font-medium">
                      {m.label.replace(/ \(.*\)| this week| a day/g, "")}
                    </th>
                  ))}
                  <th className="px-2 py-2"><span className="sr-only">Notes</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[...entries].reverse().map((e) => (
                  <tr key={e.id} className="hover:bg-muted/50">
                    <td className="px-4 py-2">
                      <Link href={`/constitution/entries/${e.id}`} className="font-medium hover:underline">
                        {fmt(e.entry_date)}
                      </Link>
                    </td>
                    {MEASURES.map((m) => (
                      <td key={m.key} className={`px-2 py-2 text-right tabular-nums ${m.key === "waist_cm" ? "font-semibold" : ""}`}>
                        {e[m.key] ?? <span className="text-muted-foreground">—</span>}
                      </td>
                    ))}
                    <td className="px-2 py-2">{e.notes && <NotebookText className="size-4 text-muted-foreground" aria-label={e.notes} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function Stat({ label, unit, now, since, week, hero = false }: { label: string; unit: string; now: number | null; since: string | null; week: string | null; hero?: boolean }) {
  return (
    <div className={`flex flex-col gap-2 rounded-2xl border bg-card p-5 ${hero ? "ring-1 ring-primary/30" : ""}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className={`font-serif font-black tabular-nums ${hero ? "text-5xl" : "text-4xl"}`}>
        {now ?? "—"} <span className="font-sans text-base font-normal text-muted-foreground">{unit}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        {since !== null ? `${since} since baseline` : "No baseline"}
        {week !== null && ` · ${week} on last time`}
      </p>
    </div>
  );
}

/** One habit's last few weeks as a sparkline, with the latest number. */
function Habit({ measure, entries }: { measure: Measure; entries: HealthEntry[] }) {
  const m = MEASURES.find((x) => x.key === measure)!;
  const values = entries.map((e) => e[measure]).filter((v): v is number => v !== null);
  const lo = Math.min(...values, 0);
  const hi = Math.max(...values, lo + 1);
  const pts = values.map((v, i) => `${values.length === 1 ? 50 : (i / (values.length - 1)) * 100},${28 - ((v - lo) / (hi - lo)) * 26}`).join(" ");
  return (
    <li className="flex flex-col gap-1 rounded-xl border bg-card p-3">
      <p className="text-xs text-muted-foreground">{m.label}</p>
      <p className="text-2xl font-semibold tabular-nums">{values.at(-1) ?? "—"}</p>
      {values.length > 1 ? (
        <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-full text-primary dark:text-blue-400" role="img" aria-label={`${m.label}, last ${values.length} weeks: ${values.join(", ")}`}>
          <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      ) : (
        <p className="h-8 text-xs text-muted-foreground">Needs two weeks</p>
      )}
    </li>
  );
}

function StartTracking() {
  return (
    <ActionForm action={startTracking} className="flex max-w-xl flex-col gap-5 rounded-2xl border bg-card p-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-2xl font-black">Where you&apos;re starting from</h2>
        <p className="text-sm text-muted-foreground">
          Your baseline: the day you started, and your weight and waist that day. Every week is measured against it.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1">
          <Label htmlFor="baseline_date">Started</Label>
          <Input id="baseline_date" name="baseline_date" type="date" defaultValue={dayKey(new Date())} required />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="baseline_waist_cm">Waist (cm)</Label>
          <Input id="baseline_waist_cm" name="baseline_waist_cm" type="number" inputMode="decimal" step={0.1} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="baseline_weight_kg">Weight (kg)</Label>
          <Input id="baseline_weight_kg" name="baseline_weight_kg" type="number" inputMode="decimal" step={0.05} />
        </div>
      </div>
      <Button size="lg" className="self-start">
        Start tracking
      </Button>
    </ActionForm>
  );
}
