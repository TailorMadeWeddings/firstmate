import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dayKey } from "@/lib/logbook";
import { currentVoyageCaptain } from "@/lib/players";
import { type TemplateKey, template } from "@/lib/voyage";
import { type Entry, loadFamilyPages } from "../data";
import { Chip, onDay, slotHref } from "../parts";

export const metadata: Metadata = { title: "The family · Voyage · First Mate" };

export default function FamilyPage() {
  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Family />
      </Suspense>
    </div>
  );
}

const LISTS: { key: TemplateKey; line: (e: Entry) => string }[] = [
  { key: "moment", line: (e) => [e.occurred_on && onDay(e.occurred_on), e.fields.where].filter(Boolean).join(" · ") },
  { key: "relative", line: (e) => e.fields.relation ?? "" },
  { key: "home", line: (e) => [e.occurred_on && `from ${onDay(e.occurred_on)}`, e.fields.moved_out && `to ${onDay(e.fields.moved_out)}`].filter(Boolean).join(" ") },
  { key: "pet", line: (e) => [e.fields.kind, e.occurred_on && `from ${onDay(e.occurred_on)}`].filter(Boolean).join(" · ") },
];

async function Family() {
  await currentVoyageCaptain();
  const pages = await loadFamilyPages();
  const years = pages.filter((p) => p.template === "snapshot").sort((a, b) => b.period! - a.period!);
  return (
    <>
      <header className="flex flex-col gap-2">
        <Link href="/voyage" className="text-sm text-muted-foreground hover:underline">
          ← Voyage
        </Link>
        <h1 className="text-4xl">The family</h1>
        <p className="text-sm text-muted-foreground">Written once for everyone, with a section on each page for each person&apos;s part.</p>
      </header>

      {LISTS.map(({ key, line }) => {
        const mine = pages.filter((p) => p.template === key);
        return (
          <section key={key} aria-labelledby={key} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 id={key} className="font-serif text-2xl font-black">
                {template(key).title}
              </h2>
              <Button asChild size="sm" variant="secondary">
                <Link href={slotHref(undefined, key, null, null)}>
                  <Plus aria-hidden /> Add
                </Link>
              </Button>
            </div>
            {mine.length > 0 && (
              <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
                {mine.map((e) => (
                  <li key={e.id}>
                    <Link href={`/voyage/page/${e.id}`} className="flex flex-col gap-0.5 px-4 py-3 hover:bg-muted sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                      <span className="font-medium">{e.title}</span>
                      <span className="text-sm text-muted-foreground">{line(e)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <section aria-labelledby="years" className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="years" className="font-serif text-2xl font-black">
            {template("snapshot").title}
          </h2>
          <p className="text-sm text-muted-foreground">{template("snapshot").blurb}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {years.map((y) => (
            <Chip key={y.id} href={`/voyage/page/${y.id}`} filled>
              {y.period}
            </Chip>
          ))}
        </div>
        <form action="/voyage/page/new" className="flex items-end gap-2">
          <input type="hidden" name="template" value="snapshot" />
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Add a year</span>
            <Input name="period" type="number" min={1900} max={2200} defaultValue={dayKey(new Date()).slice(0, 4)} required className="h-10 w-28" />
          </label>
          <Button size="sm" variant="secondary">
            Open
          </Button>
        </form>
      </section>
    </>
  );
}
