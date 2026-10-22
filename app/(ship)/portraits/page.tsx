import type { Metadata } from "next";
import { Images } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { currentCrew } from "@/lib/players";
import { loadCrew } from "../logbook/data";
import { onDay } from "../voyage/parts";
import { saveAlbum } from "./actions";
import { loadAlbums, loadTaggedPeople, loadWords } from "./data";
import { Pill } from "./parts";

export const metadata: Metadata = { title: "Portraits · First Mate" };

export default function PortraitsPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-4xl">Portraits</h1>
        <p className="text-sm text-muted-foreground">The family&apos;s photos. Anyone in the crew can add photos, tag who&apos;s in them, and put them in albums.</p>
      </header>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Albums />
      </Suspense>
    </div>
  );
}

async function Albums() {
  const member = await currentCrew();
  const [albums, crew, tagged, words] = await Promise.all([loadAlbums(), loadCrew(member.householdId), loadTaggedPeople(), loadWords()]);
  const people = crew.filter((c) => tagged.has(c.key));
  return (
    <>
      <nav aria-label="Browse photos" className="flex flex-wrap items-center gap-2">
        <Pill href="/portraits/photos">
          <Images className="size-3.5" aria-hidden /> All photos
        </Pill>
        {people.map((p) => (
          <Pill key={p.key} href={`/portraits/photos?person=${encodeURIComponent(p.key)}`} color={p.color}>
            {p.name} <span className="text-muted-foreground">{tagged.get(p.key)}</span>
          </Pill>
        ))}
        {words.map(({ word, count }) => (
          <Pill key={word} href={`/portraits/photos?tag=${encodeURIComponent(word)}`}>
            #{word} <span className="text-muted-foreground">{count}</span>
          </Pill>
        ))}
      </nav>

      <ActionForm action={saveAlbum.bind(null, null)} className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-5">
        <div className="grid min-w-48 flex-1 gap-1">
          <Label htmlFor="title">New album</Label>
          <Input id="title" name="title" required placeholder="Summer at the beach" className="h-11 text-base" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="taken_on">When (optional)</Label>
          <Input id="taken_on" name="taken_on" type="date" className="h-11 text-base" />
        </div>
        <Button size="lg">Start album</Button>
      </ActionForm>

      {albums.length === 0 ? (
        <p className="text-muted-foreground">No albums yet. Start one above, then add photos to it, or add them to All photos and sort them later.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {albums.map((a) => (
            <li key={a.id}>
              <Link href={`/portraits/${a.id}`} className="group flex flex-col gap-2">
                <span className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-muted">
                  {a.cover ? (
                    // Private, signed links: next/image's optimiser can't fetch them anyway.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.cover} alt="" loading="lazy" className="size-full object-cover transition group-hover:scale-105" />
                  ) : (
                    <Images className="size-10 text-muted-foreground" aria-hidden />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-serif text-xl font-black group-hover:underline">{a.title}</span>
                  <span className="block text-sm text-muted-foreground">
                    {[a.taken_on && onDay(a.taken_on), `${a.count} ${a.count === 1 ? "photo" : "photos"}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
