import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { currentVoyageCaptain, currentVoyageMember } from "@/lib/players";
import { readFilter } from "@/lib/portraits";
import { loadPhotos } from "../../portraits/data";
import { addFromPortraits } from "../actions";
import { loadPeople } from "../data";

export const metadata: Metadata = { title: "From Portraits · Voyage · First Mate" };

type Props = { searchParams: Promise<{ entry?: string; note?: string; person?: string; all?: string }> };

export default function PickPage(props: Props) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Pick {...props} />
      </Suspense>
    </div>
  );
}

/** Portraits photos to show on a page (Captains) or a story (whoever told it); the person's own photos first. */
async function Pick({ searchParams }: Props) {
  const q = await searchParams;
  const isId = (s?: string) => !!s && /^[0-9a-f-]{36}$/.test(s);
  const on = isId(q.entry) ? { entry_id: q.entry! } : isId(q.note) ? { note_id: q.note! } : null;
  if (!on) notFound();
  const member = "entry_id" in on ? await currentVoyageCaptain() : await currentVoyageMember();
  const person = q.all ? {} : readFilter({ person: q.person });
  const [photos, { crew }] = await Promise.all([loadPhotos(person), loadPeople(member.householdId)]);
  const back = "entry_id" in on ? `/voyage/page/${on.entry_id}` : `/voyage/stories#${on.note_id}`;
  const here = `/voyage/pick?${"entry_id" in on ? `entry=${on.entry_id}` : `note=${on.note_id}`}${q.person ? `&person=${encodeURIComponent(q.person)}` : ""}`;
  const name = "person" in person ? (crew.find((c) => c.key === person.person)?.name ?? "them") : null;

  return (
    <>
      <Link href={back} className="text-sm text-muted-foreground hover:underline">
        ← Back
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-4xl">From Portraits</h1>
        <p className="text-sm text-muted-foreground">
          {name ? `Photos ${name} is tagged in. ` : "Every photo in Portraits. "}
          {name ? (
            <Link href={`${here}&all=1`} className="underline">
              Show every photo
            </Link>
          ) : (
            q.person && (
              <Link href={here} className="underline">
                Just the ones they&apos;re tagged in
              </Link>
            )
          )}
        </p>
      </header>
      {photos.length === 0 ? (
        <p className="text-muted-foreground">
          No photos here yet.{" "}
          <Link href="/portraits" className="underline">
            Add some in Portraits
          </Link>
          .
        </p>
      ) : (
        <ActionForm action={addFromPortraits.bind(null, on)} reset={false} className="flex flex-col gap-4">
          <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4 sm:gap-2 lg:grid-cols-6">
            {photos.map((p) => (
              <li key={p.id}>
                <label className="relative block cursor-pointer overflow-hidden rounded-lg bg-muted has-[:checked]:ring-4 has-[:checked]:ring-primary">
                  <input type="checkbox" name="photos" value={p.id} className="absolute right-1.5 top-1.5 size-5" aria-label={p.caption ?? "Photo"} />
                  {p.url && (
                    // Private, signed links: next/image's optimiser can't fetch them anyway.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                  )}
                </label>
              </li>
            ))}
          </ul>
          <Button size="lg" className="sticky bottom-24 self-start shadow-lg md:bottom-4">
            Add the ones ticked
          </Button>
        </ActionForm>
      )}
    </>
  );
}
