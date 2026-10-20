import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { LiveRefresh } from "@/components/live-refresh";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Duty, GROUPS, dueLabel, groupOf, grouped } from "@/lib/duties";
import { dayKey } from "@/lib/logbook";
import { currentCrew } from "@/lib/players";
import { type CrewMember, loadCrew } from "../logbook/data";
import { addDuty } from "./actions";
import { loadDuties } from "./data";
import { CategoryList, RepeatSelect, WhoSelect } from "./duty-fields";
import { DutyRow } from "./duty-row";

export const metadata: Metadata = { title: "Duties · First Mate" };

type Search = { who?: string; category?: string };

export default function DutiesPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Duties</p>
        <h1 className="text-4xl">What needs doing</h1>
      </header>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Duties searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Duties({ searchParams }: { searchParams: Promise<Search> }) {
  const member = await currentCrew();
  const search = await searchParams;
  const [crew, { open, done }] = await Promise.all([loadCrew(member.householdId), loadDuties()]);
  const today = dayKey(new Date());
  const categories = [...new Set([...open, ...done].map((d) => d.category).filter((c): c is string => Boolean(c)))].sort();
  const who = crew.some((c) => c.key === search.who) ? search.who! : null;
  const category = search.category && categories.includes(search.category) ? search.category : null;
  const shown = (d: Duty) => (!who || d.assignee === who) && (!category || d.category === category);
  const groups = grouped(open.filter(shown), today);
  const recentlyDone = done.filter(shown);
  const href = (change: Partial<Search>) => {
    const params = new URLSearchParams(Object.entries({ ...search, ...change }).filter(([, v]) => v) as [string, string][]);
    return `/duties?${params}`;
  };
  const chip =
    "flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm hover:bg-muted aria-[current=true]:border-primary aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground";

  return (
    <>
      <LiveRefresh channel="duties" tables={["duties"]} />

      {/* Quick add: just the name is enough; the rest is optional. */}
      <ActionForm action={addDuty} className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex gap-2">
          <Input name="title" placeholder="Add a duty…" aria-label="What needs doing" required maxLength={200} className="h-11 flex-1 text-base" />
          <Button size="lg" className="h-11">
            <Plus aria-hidden /> Add
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Input name="due_on" type="date" aria-label="Due (optional)" title="Due (optional)" />
          <RepeatSelect id="quick-repeat" />
          <WhoSelect id="quick-who" crew={crew} value={who} />
          <Input name="category" list="duty-categories" aria-label="Category (optional)" placeholder="Category" maxLength={40} defaultValue={category ?? ""} />
        </div>
        <CategoryList categories={categories} />
      </ActionForm>

      <nav aria-label="Filter" className="flex flex-wrap items-center gap-1.5">
        <Link href={href({ who: undefined })} aria-current={!who ? "true" : undefined} className={chip}>
          Everyone
        </Link>
        {crew.map((c) => (
          <Link key={c.key} href={href({ who: who === c.key ? undefined : c.key })} aria-current={who === c.key ? "true" : undefined} className={chip}>
            <span className="size-2.5 rounded-full" style={{ background: c.color }} aria-hidden /> {c.name}
          </Link>
        ))}
        {categories.length > 0 && <span className="mx-1 h-5 w-px bg-border" aria-hidden />}
        {categories.map((c) => (
          <Link key={c} href={href({ category: category === c ? undefined : c })} aria-current={category === c ? "true" : undefined} className={chip}>
            {c}
          </Link>
        ))}
      </nav>

      {groups.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <p className="font-serif text-2xl italic text-muted-foreground">
            {open.length === 0 ? "All hands at rest: nothing to do." : "Nothing here for that filter."}
          </p>
        </div>
      ) : (
        groups.map(({ group, duties }) => (
          <section key={group} className="flex flex-col gap-2" aria-labelledby={`group-${group}`}>
            <h2
              id={`group-${group}`}
              className={`flex items-baseline gap-2 font-serif text-2xl font-black italic ${group === "overdue" ? "text-red-600 dark:text-red-400" : group === "today" ? "text-primary dark:text-blue-400" : ""}`}
            >
              {GROUPS[group]} <span className="font-sans text-sm font-normal not-italic text-muted-foreground">{duties.length}</span>
            </h2>
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
              {duties.map((d) => (
                <DutyRow key={d.id} duty={d} due={d.due_on && group !== "today" && group !== "tomorrow" ? dueLabel(d.due_on, today) : null} overdue={group === "overdue"} person={personFor(d, crew)} />
              ))}
            </ul>
          </section>
        ))
      )}

      {recentlyDone.length > 0 && (
        <details className="rounded-2xl border bg-card">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-muted-foreground">Done in the last fortnight ({recentlyDone.length})</summary>
          <ul className="divide-y border-t">
            {recentlyDone.map((d) => (
              <DutyRow key={d.id} duty={d} due={d.due_on ? dueLabel(d.due_on, today) : null} overdue={groupOf(d.due_on, today) === "overdue"} person={personFor(d, crew)} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

const personFor = (d: Duty, crew: CrewMember[]) => {
  const c = crew.find((x) => x.key === d.assignee);
  return c ? { name: c.name, color: c.color } : null;
};
