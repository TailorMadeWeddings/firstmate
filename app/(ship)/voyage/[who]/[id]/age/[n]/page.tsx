import type { Metadata } from "next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { dayKey } from "@/lib/logbook";
import { currentVoyageCaptain } from "@/lib/players";
import { INTERVIEW, type TemplateKey, addMonths, ageOn, pageName, template } from "@/lib/voyage";
import { bookHref, loadBook, loadPeople } from "../../../../data";
import { onDay, slotHref } from "../../../../parts";

export const metadata: Metadata = { title: "Voyage · First Mate" };

type Props = { params: Promise<{ who: string; id: string; n: string }> };

export default function AgePage(props: Props) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Age {...props} />
      </Suspense>
    </div>
  );
}

const PAGES: { key: TemplateKey; blurb: string }[] = [
  { key: "year", blurb: "Height, weight, favourites, highlights and the year's journal." },
  { key: "birthday", blurb: "The party, who came, the cake and the gifts." },
  { key: "interview", blurb: "The same questions every year." },
];

async function Age({ params }: Props) {
  const member = await currentVoyageCaptain();
  const { who, id, n: raw } = await params;
  const n = Number(raw);
  const { people } = await loadPeople(member.householdId);
  const person = people.find((p) => p.key === `${who}:${id}`);
  const today = dayKey(new Date());
  if (!person?.born || !Number.isInteger(n) || n < 1 || n > ageOn(person.born, today)) notFound();
  const entries = await loadBook(person.key);
  const at = (key: TemplateKey, period: number) => entries.find((e) => e.template === key && e.period === period);
  const from = addMonths(person.born, n * 12);
  const until = addMonths(person.born, (n + 1) * 12);
  const interview = at("interview", n);
  const before = entries.filter((e) => e.template === "interview" && e.period !== null && e.period < n).sort((a, b) => b.period! - a.period!)[0];
  const book = bookHref(person.key);
  const step = "flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm hover:bg-muted";

  return (
    <>
      <Link href={book} className="text-sm text-muted-foreground hover:underline">
        ← {person.name}
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-4xl">
          {person.name} at {n}
        </h1>
        <p className="text-muted-foreground">
          {onDay(from)} to {until > today ? "now" : onDay(until)}
        </p>
      </header>

      <ul className="grid gap-3">
        {PAGES.map(({ key, blurb }) => {
          const e = at(key, n);
          return (
            <li key={key}>
              <Link href={slotHref(e, key, person.key, n)} className={`flex flex-col gap-0.5 rounded-2xl border p-5 hover:bg-muted ${e ? "bg-card" : "border-dashed"}`}>
                <span className="font-serif text-xl font-black">{pageName(key, n)}</span>
                <span className="text-sm text-muted-foreground">{e ? "Written. Open to read or change it." : blurb}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {interview && before && (
        <section aria-labelledby="compare" className="flex flex-col gap-3">
          <h2 id="compare" className="font-serif text-2xl font-black">
            The interview, side by side
          </h2>
          <div className="overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">{template("interview").title}</th>
                  <th className="px-4 py-2 font-medium">At {before.period}</th>
                  <th className="px-4 py-2 font-medium">At {n}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {INTERVIEW.filter((q) => interview.fields[q.name] || before.fields[q.name]).map((q) => (
                  <tr key={q.name}>
                    <th scope="row" className="px-4 py-2 text-left font-medium">
                      {q.label}
                    </th>
                    <td className="px-4 py-2 text-muted-foreground">{before.fields[q.name]}</td>
                    <td className="px-4 py-2">{interview.fields[q.name]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <nav aria-label="Other years" className="flex justify-between gap-2">
        {n > 1 ? (
          <Link href={`${book}/age/${n - 1}`} className={step}>
            <ChevronLeft className="size-4" aria-hidden /> Age {n - 1}
          </Link>
        ) : (
          <Link href={book} className={step}>
            <ChevronLeft className="size-4" aria-hidden /> The first year
          </Link>
        )}
        {n < ageOn(person.born, today) && (
          <Link href={`${book}/age/${n + 1}`} className={step}>
            Age {n + 1} <ChevronRight className="size-4" aria-hidden />
          </Link>
        )}
      </nav>
    </>
  );
}
