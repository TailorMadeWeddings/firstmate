import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { currentVoyageCaptain } from "@/lib/players";
import { loadPeople, loadSchoolUpdates } from "../data";
import { Chip, onDay, slotHref } from "../parts";
import { StoryparkImport } from "../storypark-import";

export const metadata: Metadata = { title: "School updates · Voyage · First Mate" };

type Props = { searchParams: Promise<{ person?: string }> };

export default function SchoolPage(props: Props) {
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <School {...props} />
      </Suspense>
    </div>
  );
}

/** Every school update, or one child's, newest first by year; importing and adding is per child. */
async function School({ searchParams }: Props) {
  const member = await currentVoyageCaptain();
  const { person } = await searchParams;
  const [{ people }, all] = await Promise.all([loadPeople(member.householdId), loadSchoolUpdates()]);
  const kids = people.filter((p) => p.kind === "dependent");
  const child = kids.find((k) => k.key === person);
  const kid = (id: string | null) => kids.find((k) => k.id === id);
  const updates = child ? all.filter((u) => u.dependent_id === child.id) : all;
  const years = new Map<string, typeof updates>();
  for (const u of updates) {
    const year = u.occurred_on?.slice(0, 4) ?? "Undated";
    years.set(year, [...(years.get(year) ?? []), u]);
  }

  return (
    <>
      <header className="flex flex-col gap-2">
        <Link href="/voyage" className="text-sm text-muted-foreground hover:underline">
          ← Voyage
        </Link>
        <h1 className="text-4xl">School updates</h1>
        <p className="text-sm text-muted-foreground">What childcare and school sent home, from Storypark. Kept apart from the stories we write.</p>
      </header>

      <nav aria-label="Whose updates" className="flex flex-wrap gap-2">
        <Chip href="/voyage/school" filled={!child}>
          Everyone
        </Chip>
        {kids.map((k) => (
          <Chip key={k.key} href={`/voyage/school?person=${encodeURIComponent(k.key)}`} filled={child?.key === k.key}>
            {k.name}
          </Chip>
        ))}
      </nav>

      {child ? (
        <div className="flex flex-wrap items-start gap-2">
          <StoryparkImport householdId={member.householdId} dependentId={child.id} name={child.name} />
          <Button asChild size="sm" variant="secondary">
            <Link href={slotHref(undefined, "school-update", child.key, null)}>
              <Plus aria-hidden /> Add one by hand
            </Link>
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Pick a child to import their Storypark export or add an update by hand.</p>
      )}

      {updates.length === 0 && <p className="text-muted-foreground">None yet.</p>}
      {[...years].map(([year, list]) => (
        <section key={year} aria-labelledby={`y${year}`} className="flex flex-col gap-3">
          <h2 id={`y${year}`} className="font-serif text-2xl font-black">
            {year} <span className="font-sans text-sm font-normal text-muted-foreground">· {list.length}</span>
          </h2>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {list.map((u) => (
              <li key={u.id}>
                <Link href={`/voyage/page/${u.id}`} className="flex items-baseline gap-3 px-4 py-3 hover:bg-muted">
                  {!child && <span className="size-2.5 shrink-0 self-center rounded-full" style={{ background: kid(u.dependent_id)?.color }} title={kid(u.dependent_id)?.name} aria-hidden />}
                  <span className="min-w-0 flex-1 truncate font-medium">{u.title}</span>
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {!child && `${kid(u.dependent_id)?.name ?? ""} · `}
                    {u.occurred_on ? onDay(u.occurred_on) : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
