import type { Metadata } from "next";
import { Feather, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dayKey } from "@/lib/logbook";
import type { PersonKey } from "@/lib/medical";
import { currentVoyageCaptain } from "@/lib/players";
import { type TemplateKey, ageOn, bookSlots, growth, inGroup, kindergartenYear, ordinal, pageName, schoolYear, template } from "@/lib/voyage";
import { TrendChart } from "../../../constitution/trend-chart";
import { setBirthday } from "../../actions";
import { type Entry, type Person, bookHref, loadBook, loadMentions, loadPeople, loadStories } from "../../data";
import { Chip, onDay, slotHref } from "../../parts";
import { StoryparkImport } from "../../storypark-import";

export const metadata: Metadata = { title: "Voyage · First Mate" };

type Props = { params: Promise<{ who: string; id: string }> };

export default function BookPage(props: Props) {
  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Book {...props} />
      </Suspense>
    </div>
  );
}

async function Book({ params }: Props) {
  const member = await currentVoyageCaptain();
  const { who, id } = await params;
  const { people } = await loadPeople(member.householdId);
  const person = people.find((p) => p.key === `${who}:${id}`);
  if (!person) notFound();
  const [entries, mentions, stories] = await Promise.all([loadBook(person.key), loadMentions(person.key), loadStories(person.key)]);
  const today = dayKey(new Date());
  const slots = bookSlots(person.born, today);
  const slot = new Map(entries.filter((e) => e.period !== null).map((e) => [`${e.template}:${e.period}`, e]));
  const at = (key: TemplateKey, period: number) => slot.get(`${key}:${period}`);
  const chip = (key: TemplateKey, period: number, label: string) => (
    <Chip key={`${key}:${period}`} href={slotHref(at(key, period), key, person.key, period)} filled={Boolean(at(key, period))}>
      {label}
    </Chip>
  );
  const { weight, height } = growth(entries, person.born);
  const captains = people.filter((p) => p.kind === "profile");

  return (
    <>
      <header className="flex flex-col gap-2">
        <Link href="/voyage" className="text-sm text-muted-foreground hover:underline">
          ← Voyage
        </Link>
        <div className="flex items-center gap-3">
          <span className="size-4 rounded-full" style={{ background: person.color }} aria-hidden />
          <h1 className="text-4xl">{person.name}</h1>
        </div>
        <Born person={person} today={today} />
      </header>

      {(weight.length > 1 || height.length > 1) && (
        <section aria-labelledby="growth" className="flex flex-col gap-3">
          <h2 id="growth" className="font-serif text-2xl font-black">
            Growing
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              { label: "Weight", unit: "kg", points: weight },
              { label: "Height", unit: "cm", points: height },
            ]
              .filter((s) => s.points.length > 1)
              .map((s) => (
                <div key={s.label} className="rounded-2xl border bg-card p-4">
                  <TrendChart
                    label={s.label}
                    unit={s.unit}
                    points={s.points.map((p) => ({ ...p, detail: [person.born ? `Age ${ageOn(person.born, p.date)}` : ""] }))}
                    baseline={null}
                    height={200}
                    tone="primary"
                  />
                </div>
              ))}
          </div>
        </section>
      )}

      {person.kind === "profile" && <Contents title="About me">{inGroup("about").map((k) => chip(k, 0, template(k).title))}</Contents>}

      <Contents title="The beginning">{inGroup("beginnings").map((k) => chip(k, 0, template(k).title))}</Contents>

      <Contents title="The first year" note={person.born ? undefined : "Months open from the date of birth."}>
        {(person.born ? slots.months : Array.from({ length: 12 }, (_, i) => i + 1)).map((n) => chip("month", n, pageName("month", n)))}
      </Contents>

      {slots.years.length > 0 && (
        <Contents title="Every year" note="A page for each age, the birthday, and the birthday interview.">
          {slots.years.map((n) => (
            <Chip key={n} href={`${bookHref(person.key)}/age/${n}`} filled={["year", "birthday", "interview"].some((k) => at(k as TemplateKey, n))} title={`${ordinal(n)} birthday`}>
              {n}
            </Chip>
          ))}
        </Contents>
      )}

      {slots.school.length > 0 && person.born && (
        <Contents title="School">
          {slots.school.map((n) => chip("school", n, `${schoolYear(n)} · ${kindergartenYear(person.born!) + n}`))}
        </Contents>
      )}

      {person.kind === "dependent" && (
        <div id="school-updates" className="flex scroll-mt-20 flex-col gap-3">
          <Collection title="School updates" tkey="school-update" entries={entries} person={person.key} />
          <StoryparkImport householdId={member.householdId} dependentId={person.id} name={person.name} />
        </div>
      )}

      <Collection title="Sport, music & other activities" tkey="activity" entries={entries} person={person.key} line={(e) => [e.fields.kind, e.fields.season, e.fields.level].filter(Boolean).join(" · ")} />

      <section aria-labelledby="collections" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="collections" className="font-serif text-2xl font-black">
            Collections
          </h2>
          {chip("teeth", 0, template("teeth").title)}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {(["first", "saying", "day", "trip", "letter", "keepsake"] as const).map((k) => (
            <Collection key={k} title={template(k).title} tkey={k} entries={entries} person={person.key} small />
          ))}
        </div>
      </section>

      <section aria-labelledby="family" className="flex flex-col gap-3">
        <h2 id="family" className="font-serif text-2xl font-black">
          Family
        </h2>
        <div className="flex flex-wrap gap-2">
          {person.kind === "dependent" &&
            captains.map((c) => (
              <Chip key={c.key} href={bookHref(c.key)} filled>
                About {c.name}
              </Chip>
            ))}
          {person.born && person.born <= today && (
            <Chip href={`/voyage/family/year/${person.born.slice(0, 4)}`} filled={false}>
              The year I was born, {person.born.slice(0, 4)}
            </Chip>
          )}
          <Chip href="/voyage/family" filled={false}>
            All the family pages
          </Chip>
        </div>
        {mentions.length > 0 && (
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {mentions.map((m) => (
              <li key={m.id}>
                <Link href={`/voyage/page/${m.entry_id}`} className="flex flex-col gap-0.5 px-4 py-3 hover:bg-muted">
                  <span className="font-medium">
                    {pageName(m.entry.template, m.entry.period, m.entry.title)}
                    <span className="font-normal text-muted-foreground"> · {template(m.entry.template).title}</span>
                  </span>
                  <span className="line-clamp-2 text-sm text-muted-foreground">{m.body}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="stories" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="stories" className="flex items-center gap-2 font-serif text-2xl font-black">
            <Feather className="size-5" aria-hidden /> Stories from the crew
          </h2>
          <Button asChild size="sm" variant="secondary">
            <Link href={`/voyage/stories?person=${encodeURIComponent(person.key)}`}>
              <Plus aria-hidden /> Story
            </Link>
          </Button>
        </div>
        {stories.length === 0 ? (
          <p className="text-sm text-muted-foreground">No stories yet. Officers can add them from Voyage on their own phone.</p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {stories.map((s) => (
              <li key={s.id}>
                <Link href={`/voyage/stories#${s.id}`} className="flex flex-col gap-0.5 px-4 py-3 hover:bg-muted">
                  <span className="font-medium">{s.title || "A story"}</span>
                  <span className="line-clamp-2 text-sm text-muted-foreground">{s.body}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Born({ person, today }: { person: Person; today: string }) {
  if (person.born)
    return (
      <p className="text-muted-foreground">
        {person.born > today ? `Due ${onDay(person.born)}` : `Born ${onDay(person.born)} · ${ageOn(person.born, today) < 1 ? "under one" : `${ageOn(person.born, today)} years old`}`}
      </p>
    );
  if (person.kind === "dependent")
    return (
      <p className="text-sm text-muted-foreground">
        Add {person.name}&apos;s birthday on the{" "}
        <Link href="/crew" className="text-primary hover:underline dark:text-blue-400">
          Crew page
        </Link>{" "}
        to open each month, year and school year.
      </p>
    );
  return (
    <ActionForm action={setBirthday.bind(null, person.id)} reset={false} className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-sm">
        <span className="text-muted-foreground">{person.name}&apos;s birthday, to open every year of the book</span>
        <Input type="date" name="born" required className="h-10 w-48" />
      </label>
      <Button size="sm">Save</Button>
    </ActionForm>
  );
}

function Contents({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-serif text-2xl font-black">{title}</h2>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

/** A collection in a book: the latest few, and a button to add one. */
function Collection({
  title,
  tkey,
  entries,
  person,
  line,
  small,
}: {
  title: string;
  tkey: TemplateKey;
  entries: Entry[];
  person: PersonKey;
  line?: (e: Entry) => string;
  small?: boolean;
}) {
  const mine = entries.filter((e) => e.template === tkey);
  const shown = small ? mine.slice(0, 5) : mine;
  return (
    <section className={`flex flex-col gap-3 ${small ? "rounded-2xl border bg-card p-4" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className={small ? "font-serif text-lg font-black" : "font-serif text-2xl font-black"}>
          {title}
          {small && mine.length > 0 && <span className="font-sans text-sm font-normal text-muted-foreground"> · {mine.length}</span>}
        </h3>
        <Button asChild size="sm" variant="secondary">
          <Link href={slotHref(undefined, tkey, person, null)}>
            <Plus aria-hidden /> Add
          </Link>
        </Button>
      </div>
      {shown.length > 0 && (
        <ul className={small ? "flex flex-col gap-1" : "divide-y overflow-hidden rounded-2xl border bg-card"}>
          {shown.map((e) => (
            <li key={e.id}>
              <Link href={`/voyage/page/${e.id}`} className={`flex items-baseline gap-3 hover:underline ${small ? "" : "px-4 py-3 hover:bg-muted hover:no-underline"}`}>
                <span className="min-w-0 flex-1 truncate font-medium">{e.title}</span>
                <span className="shrink-0 text-sm text-muted-foreground">{line ? line(e) : e.occurred_on ? onDay(e.occurred_on) : ""}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
