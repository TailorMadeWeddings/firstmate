import { ChefHat } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { TZ, addDays, dayKey, startOfDay } from "@/lib/logbook";
import { canSeeLedger, currentMember } from "@/lib/players";
import { sectionIcons, visibleSections } from "@/lib/sections";
import { createClient } from "@/lib/supabase/server";
import { loadEntries } from "./logbook/data";

export default function Home() {
  return (
    <div className="flex flex-col gap-10">
      <Suspense fallback={<div className="h-28" />}>
        <Masthead />
      </Suspense>
      <Suspense>
        <Tonight />
      </Suspense>
      <Suspense>
        <Sections />
      </Suspense>
      <Link href="/helm" className="self-start text-sm text-muted-foreground hover:underline">
        Kitchen screen settings
      </Link>
    </div>
  );
}

/** The mock-up's editorial header: the household's name, and today in italic. */
async function Masthead() {
  const member = await currentMember();
  const supabase = await createClient();
  const { data } = await supabase.from("households").select("name").eq("id", member.householdId).maybeSingle();
  const today = new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Australia/Sydney",
  }).format(new Date());
  return (
    <header className="flex flex-col gap-1 border-b pb-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">First Mate</p>
      <h1 className="text-4xl md:text-6xl">{data?.name ?? "Home"}</h1>
      <p className="font-serif text-2xl font-light italic text-muted-foreground md:text-3xl">{today}</p>
    </header>
  );
}

async function Sections() {
  const member = await currentMember();
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {visibleSections(await canSeeLedger(member)).map((s) => {
        const Icon = sectionIcons[s.slug];
        return (
          <li key={s.slug}>
            <Link
              href={`/${s.slug}`}
              className="group flex h-full flex-col gap-3 rounded-2xl border bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <Icon aria-hidden className="size-7 text-primary" />
              <span className="font-serif text-2xl font-black tracking-tight">{s.name}</span>
              <span className="text-sm text-muted-foreground">{s.blurb}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Today's meals from the Logbook, with a button straight into cooking mode. */
async function Tonight() {
  const member = await currentMember();
  if (member.role === "guest") return null;
  const today = dayKey(new Date());
  const meals = (await loadEntries(startOfDay(today), startOfDay(addDays(today, 1)))).filter((e) => e.recipeId && !e.allDay);
  if (meals.length === 0) return null;
  const time = (d: Date) => new Intl.DateTimeFormat("en-AU", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d);
  return (
    <section aria-labelledby="tonight" className="flex flex-col gap-3 rounded-2xl border bg-card p-6 shadow-sm">
      <h2 id="tonight" className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
        On the menu today
      </h2>
      <ul className="flex flex-col gap-3">
        {meals.map((m) => (
          <li key={`${m.eventId}${m.originalStart.getTime()}`} className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="min-w-0 flex-1">
              <Link href={`/galley/${m.recipeId}`} className="font-serif text-3xl font-black hover:underline">
                {m.title}
              </Link>
              <span className="ml-3 text-sm text-muted-foreground">{time(m.start)}</span>
            </span>
            <Button asChild size="lg">
              <Link href={`/galley/${m.recipeId}/cook`}>
                <ChefHat aria-hidden /> Cook
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
