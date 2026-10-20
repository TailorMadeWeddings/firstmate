import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { isPersonKey } from "@/lib/medical";
import { currentVoyageCaptain } from "@/lib/players";
import { addMonths, isTemplate, pageName, periodProblem, template } from "@/lib/voyage";
import { savePage } from "../../actions";
import { type Entry, bookHref, findSlot, loadPeople } from "../../data";
import { PageFields } from "../../parts";

export const metadata: Metadata = { title: "New page · Voyage · First Mate" };

type Props = { searchParams: Promise<{ template?: string; person?: string; period?: string }> };

export default function NewPage(props: Props) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <New {...props} />
      </Suspense>
    </div>
  );
}

async function New({ searchParams }: Props) {
  const member = await currentVoyageCaptain();
  const { template: key, person: who, period: rawPeriod } = await searchParams;
  const period = rawPeriod === undefined ? null : Number(rawPeriod);
  if (!isTemplate(key)) notFound();
  const t = template(key);
  const { people } = await loadPeople(member.householdId);
  const person = t.family ? null : isPersonKey(who) ? people.find((p) => p.key === who) : undefined;
  if (person === undefined || periodProblem(key, period)) notFound();
  // A slot that's already written opens what's there.
  if (period !== null) {
    const existing = await findSlot(key, period, person?.key ?? null);
    if (existing) redirect(`/voyage/page/${existing}`);
  }
  // Suggestions from what's already known.
  const values: Partial<Entry> =
    key === "birth" ? { occurred_on: person?.born ?? null }
    : key === "birthday" && person?.born && period ? { occurred_on: addMonths(person.born, period * 12) }
    : key === "name" && person ? { fields: { full: person.name } }
    : {};
  const back = person
    ? t.repeat === "year" && period ? `${bookHref(person.key)}/age/${period}` : bookHref(person.key)
    : "/voyage/family";

  return (
    <>
      <Link href={back} className="text-sm text-muted-foreground hover:underline">
        ← {person ? person.name : "The family"}
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl">{t.repeat === "many" ? `New: ${t.title}` : pageName(key, period)}</h1>
        {person && <p className="text-muted-foreground">{person.name}&apos;s book</p>}
        {t.blurb && <p className="text-sm text-muted-foreground">{t.blurb}</p>}
      </header>
      <ActionForm action={savePage.bind(null, null, key, person?.key ?? null, period)} reset={false} className="flex flex-col gap-6 rounded-2xl border bg-card p-5">
        <PageFields tkey={key} period={period} values={values} />
        <p className="text-sm text-muted-foreground">Photos go on once it&apos;s saved. Leave anything blank that you don&apos;t know.</p>
        <Button size="lg" className="self-start">
          Save
        </Button>
      </ActionForm>
    </>
  );
}
