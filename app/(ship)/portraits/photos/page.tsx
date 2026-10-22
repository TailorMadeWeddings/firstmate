import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PhotoAdder } from "@/components/photo-adder";
import { currentCrew } from "@/lib/players";
import { readFilter } from "@/lib/portraits";
import { loadCrew } from "../../logbook/data";
import { addPhoto } from "../actions";
import { PHOTO_BUCKET, loadAlbums, loadPhotos } from "../data";
import { Tiles } from "../tiles";

export const metadata: Metadata = { title: "Photos · Portraits · First Mate" };

type Props = { searchParams: Promise<{ person?: string; tag?: string }> };

/** Every photo, or the ones someone is in, or the ones with a tag. */
export default function PhotosPage(props: Props) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Photos {...props} />
      </Suspense>
    </div>
  );
}

async function Photos({ searchParams }: Props) {
  const member = await currentCrew();
  const { person, tag } = await searchParams;
  // Albums have their own page; this one is all photos, a person's, or a tag's.
  const filter = readFilter({ person, tag });
  const [photos, crew, albums] = await Promise.all([loadPhotos(filter), loadCrew(member.householdId), loadAlbums()]);
  const title = "person" in filter ? `Photos of ${crew.find((c) => c.key === filter.person)?.name ?? "someone"}` : "word" in filter ? `#${filter.word}` : "All photos";

  return (
    <>
      <Link href="/portraits" className="text-sm text-muted-foreground hover:underline">
        ← Portraits
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-4xl">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {photos.length} {photos.length === 1 ? "photo" : "photos"}
        </p>
      </header>
      {!("person" in filter || "word" in filter) && <PhotoAdder bucket={PHOTO_BUCKET} householdId={member.householdId} save={addPhoto.bind(null, null)} />}
      <Tiles photos={photos} filter={filter} albums={albums} crew={crew} />
    </>
  );
}
