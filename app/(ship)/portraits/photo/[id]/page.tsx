import type { Metadata } from "next";
import { ExternalLink, ImageIcon, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { currentCrew } from "@/lib/players";
import { filterQuery, readFilter } from "@/lib/portraits";
import { loadCrew } from "../../../logbook/data";
import { area, onDay } from "../../../voyage/parts";
import { deletePhoto, removeFromAlbum, savePhoto, setCover } from "../../actions";
import { loadAlbum, loadAlbums, loadPhoto, loadPhotos } from "../../data";
import { Pill } from "../../parts";
import { Viewer } from "../../viewer";

export const metadata: Metadata = { title: "Photo · Portraits · First Mate" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ album?: string; person?: string; tag?: string }> };

export default function PhotoPage(props: Props) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<div className="h-[75vh] rounded-2xl bg-black" />}>
        <Photo {...props} />
      </Suspense>
    </div>
  );
}

async function Photo({ params, searchParams }: Props) {
  const member = await currentCrew();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const filter = readFilter(await searchParams);
  const [photo, around, albums, crew, album] = await Promise.all([
    loadPhoto(id),
    loadPhotos(filter, false),
    loadAlbums(),
    loadCrew(member.householdId),
    "album" in filter ? loadAlbum(filter.album) : Promise.resolve(null),
  ]);
  if (!photo) notFound();

  const query = filterQuery(filter);
  const at = around.findIndex((p) => p.id === photo.id);
  const href = (i: number) => (at >= 0 && around[i] ? `/portraits/photo/${around[i].id}${query}` : null);
  const back = album ? `/portraits/${album.id}` : `/portraits/photos${query}`;
  const captain = member.role === "owner";
  const canDelete = captain || photo.created_by === member.id;
  const canCover = album && (captain || album.created_by === member.id);
  const isCover = album?.cover_photo_id === photo.id;
  const people = crew.filter((c) => photo.people.includes(c.key));

  return (
    <>
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <Link href={back} className="hover:underline">
          ← {album ? album.title : "Photos"}
        </Link>
        {at >= 0 && (
          <span>
            {at + 1} of {around.length}
          </span>
        )}
      </div>

      <Viewer url={photo.url} caption={photo.caption} prev={href(at - 1)} next={href(at + 1)} back={back} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm text-muted-foreground">{onDay(photo.taken_on)}</span>
        {people.map((p) => (
          <Pill key={p.key} href={`/portraits/photos?person=${encodeURIComponent(p.key)}`} color={p.color}>
            {p.name}
          </Pill>
        ))}
        {photo.words.map((w) => (
          <Pill key={w} href={`/portraits/photos?tag=${encodeURIComponent(w)}`}>
            #{w}
          </Pill>
        ))}
        {albums
          .filter((a) => photo.albums.includes(a.id))
          .map((a) => (
            <Pill key={a.id} href={`/portraits/${a.id}`}>
              <ImageIcon className="size-3.5" aria-hidden /> {a.title}
            </Pill>
          ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {photo.url && (
          <Button asChild variant="secondary" size="sm">
            <a href={photo.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden /> Original
            </a>
          </Button>
        )}
        {canCover && (
          <ActionForm action={setCover.bind(null, album.id, isCover ? null : photo.id)}>
            <Button variant="secondary" size="sm">
              {isCover ? "Stop using as cover" : "Use as album cover"}
            </Button>
          </ActionForm>
        )}
        {album && (
          <ActionForm action={removeFromAlbum.bind(null, album.id, [photo.id], true)} confirm={`Take this photo out of “${album.title}”? It stays in All photos.`}>
            <Button variant="secondary" size="sm">
              Take out of album
            </Button>
          </ActionForm>
        )}
        {canDelete && (
          <ActionForm action={deletePhoto.bind(null, photo.id, back)} confirm="Delete this photo from every album?">
            <Button variant="ghost" size="sm" className="text-red-600">
              <Trash2 aria-hidden /> Delete
            </Button>
          </ActionForm>
        )}
      </div>

      <details className="max-w-3xl rounded-2xl border bg-card p-5" open={!photo.caption && photo.people.length + photo.words.length === 0}>
        <summary className="cursor-pointer font-medium">Caption, tags and albums</summary>
        <ActionForm action={savePhoto.bind(null, photo.id)} reset={false} className="mt-4 flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="grid gap-1">
              <Label htmlFor="caption">Caption</Label>
              <textarea id="caption" name="caption" rows={2} defaultValue={photo.caption ?? ""} className={area} />
            </div>
            <div className="grid content-start gap-1">
              <Label htmlFor="taken_on">Taken on</Label>
              <Input id="taken_on" name="taken_on" type="date" required defaultValue={photo.taken_on} className="h-11 text-base" />
            </div>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Who&apos;s in it</legend>
            <div className="flex flex-wrap gap-2">
              {crew.map((c) => (
                <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm has-[:checked]:border-foreground has-[:checked]:bg-muted">
                  <input type="checkbox" name="people" value={c.key} defaultChecked={photo.people.includes(c.key)} className="size-4" />
                  <span className="size-2.5 rounded-full" style={{ background: c.color }} aria-hidden />
                  {c.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-1">
            <Label htmlFor="words">Tags, separated by commas</Label>
            <Input id="words" name="words" defaultValue={photo.words.join(", ")} placeholder="beach, birthday, christmas 2025" className="h-11 text-base" />
          </div>
          {albums.length > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Albums</legend>
              <div className="flex flex-wrap gap-2">
                {albums.map((a) => (
                  <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm has-[:checked]:border-foreground has-[:checked]:bg-muted">
                    <input type="checkbox" name="albums" value={a.id} defaultChecked={photo.albums.includes(a.id)} className="size-4" />
                    {a.title}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <Button size="lg" className="self-start">
            Save
          </Button>
        </ActionForm>
      </details>
    </>
  );
}
