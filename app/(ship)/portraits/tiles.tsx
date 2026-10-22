"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { type Filter, filterQuery } from "@/lib/portraits";
import { removeFromAlbum, tagPhotos } from "./actions";
import type { Photo } from "./data";

type Person = { key: string; name: string; color: string };

/**
 * Square thumbnails, each opening the viewer with this filter's next and
 * previous. "Select" picks several at once to tag, file in an album, or (in
 * an album) take out of it.
 */
export function Tiles({ photos, filter, albums, crew }: { photos: Photo[]; filter: Filter; albums: { id: string; title: string }[]; crew: Person[] }) {
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const stop = () => {
    setSelecting(false);
    setPicked(new Set());
    setProblem(null);
  };
  const toggle = (id: string) =>
    setPicked((was) => {
      const now = new Set(was);
      if (!now.delete(id)) now.add(id);
      return now;
    });
  const run = (work: () => Promise<string | null>) =>
    start(async () => {
      const failed = await work();
      setProblem(failed);
      if (!failed) {
        stop();
        router.refresh();
      }
    });

  if (photos.length === 0) return <p className="text-muted-foreground">No photos here yet.</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Button variant="secondary" size="sm" onClick={() => (selecting ? stop() : setSelecting(true))}>
          {selecting ? "Cancel" : "Select"}
        </Button>
        {selecting && (
          <>
            <span className="text-sm text-muted-foreground">{picked.size ? `${picked.size} selected` : "Tap photos to pick them"}</span>
            <button type="button" className="text-sm underline" onClick={() => setPicked(new Set(photos.map((p) => p.id)))}>
              All
            </button>
          </>
        )}
      </div>

      <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4 sm:gap-2 lg:grid-cols-6">
        {photos.map((p) => {
          const img = p.url && (
            // Private, signed links: next/image's optimiser can't fetch them anyway.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.url} alt={p.caption ?? ""} loading="lazy" className="aspect-square w-full object-cover transition hover:opacity-90" />
          );
          return (
            <li key={p.id} className="relative overflow-hidden rounded-lg bg-muted">
              {selecting ? (
                <button type="button" onClick={() => toggle(p.id)} aria-pressed={picked.has(p.id)} aria-label={p.caption ?? "Photo"} className="block w-full">
                  {img}
                  <span
                    className={`absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full border-2 border-white ${picked.has(p.id) ? "bg-primary text-primary-foreground" : "bg-black/30"}`}
                    aria-hidden
                  >
                    {picked.has(p.id) && <Check className="size-4" />}
                  </span>
                </button>
              ) : (
                <Link href={`/portraits/photo/${p.id}${filterQuery(filter)}`} title={p.caption ?? undefined} className="block">
                  {img}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {selecting && picked.size > 0 && (
        <form
          className="sticky bottom-24 z-30 flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-lg md:bottom-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            picked.forEach((id) => form.append("ids", id));
            run(() => tagPhotos(null, form));
          }}
        >
          <fieldset disabled={busy} className="contents">
            <p className="font-medium">
              Add to {picked.size} {picked.size === 1 ? "photo" : "photos"}
            </p>
            <div className="flex flex-wrap gap-2">
              {crew.map((c) => (
                <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm has-[:checked]:border-foreground has-[:checked]:bg-muted">
                  <input type="checkbox" name="people" value={c.key} className="size-4" />
                  <span className="size-2.5 rounded-full" style={{ background: c.color }} aria-hidden />
                  {c.name}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Input name="words" placeholder="Tags: beach, birthday" aria-label="Tags, separated by commas" className="h-10 min-w-48 flex-1 text-base" />
              {albums.length > 0 && (
                <NativeSelect name="album" defaultValue="" aria-label="Add to album" className="h-10 text-base">
                  <option value="">No album</option>
                  {albums.map((a) => (
                    <option key={a.id} value={a.id}>
                      Add to {a.title}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button>{busy ? "Saving…" : "Save"}</Button>
              {"album" in filter && (
                <Button type="button" variant="ghost" onClick={() => confirm("Take these out of the album? They stay in All photos.") && run(() => removeFromAlbum(filter.album, [...picked], false))}>
                  Take out of album
                </Button>
              )}
            </div>
            {problem && (
              <p role="alert" className="text-sm text-red-600">
                {problem}
              </p>
            )}
          </fieldset>
        </form>
      )}
    </div>
  );
}
