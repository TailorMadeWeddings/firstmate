import type { Metadata } from "next";
import { BookHeart, Feather, Home } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { dayKey } from "@/lib/logbook";
import { currentVoyageCaptain } from "@/lib/players";
import { ageOn } from "@/lib/voyage";
import { bookHref, loadFamilyPages, loadPeople, loadStories } from "./data";
import { onDay } from "./parts";

export const metadata: Metadata = { title: "Voyage · First Mate" };

export default function VoyagePage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-4xl">Voyage</h1>
        <p className="text-sm text-muted-foreground">
          A life journal for everyone in the family: the baby book, then every year after. Only the Captains can see the books.
        </p>
      </header>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Books />
      </Suspense>
    </div>
  );
}

async function Books() {
  const member = await currentVoyageCaptain();
  const [{ people }, family, stories] = await Promise.all([loadPeople(member.householdId), loadFamilyPages(), loadStories()]);
  const today = dayKey(new Date());
  const card = "flex items-center gap-4 rounded-2xl border bg-card p-5 hover:bg-muted";
  return (
    <>
      <section aria-labelledby="books" className="flex flex-col gap-3">
        <h2 id="books" className="font-serif text-2xl font-black">
          The books
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {people.map((p) => (
            <li key={p.key}>
              <Link href={bookHref(p.key)} className={card}>
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full text-white" style={{ background: p.color }}>
                  <BookHeart className="size-6" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-serif text-xl font-black">{p.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {p.born
                      ? p.born > today
                        ? `Due ${onDay(p.born)}`
                        : `Born ${onDay(p.born)} · ${ageOn(p.born, today) < 1 ? "under one" : `${ageOn(p.born, today)} years old`}`
                      : "Add a birthday to open every year of the book"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="together" className="grid gap-3 sm:grid-cols-2">
        <h2 id="together" className="sr-only">
          Together
        </h2>
        <Link href="/voyage/family" className={card}>
          <Home className="size-8 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            <span className="block font-serif text-xl font-black">The family</span>
            <span className="block text-sm text-muted-foreground">
              Homes, pets, relatives, shared moments and the news of each year. {family.length ? `${family.length} pages.` : ""}
            </span>
          </span>
        </Link>
        <Link href="/voyage/stories" className={card}>
          <Feather className="size-8 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            <span className="block font-serif text-xl font-black">Stories from the crew</span>
            <span className="block text-sm text-muted-foreground">
              Officers (grandparents, say) can tell stories about anyone here. {stories.length ? `${stories.length} so far.` : ""}
            </span>
          </span>
        </Link>
      </section>
    </>
  );
}
