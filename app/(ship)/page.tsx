import Link from "next/link";
import { Suspense } from "react";
import { canSeeLedger, currentMember } from "@/lib/players";
import { sectionIcons, visibleSections } from "@/lib/sections";
import { createClient } from "@/lib/supabase/server";

export default function Home() {
  return (
    <div className="flex flex-col gap-10">
      <Suspense fallback={<div className="h-28" />}>
        <Masthead />
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
