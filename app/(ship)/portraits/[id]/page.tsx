import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { PhotoAdder } from "@/components/photo-adder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { currentCrew } from "@/lib/players";
import { area, onDay } from "../../voyage/parts";
import { addPhoto, deleteAlbum, saveAlbum } from "../actions";
import { loadCrew } from "../../logbook/data";
import { PHOTO_BUCKET, loadAlbum, loadAlbums, loadPhotos } from "../data";
import { Tiles } from "../tiles";

export const metadata: Metadata = { title: "Portraits · First Mate" };

type Props = { params: Promise<{ id: string }> };

export default function AlbumPage(props: Props) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Album {...props} />
      </Suspense>
    </div>
  );
}

async function Album({ params }: Props) {
  const member = await currentCrew();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const album = await loadAlbum(id);
  if (!album) notFound();
  const [photos, albums, crew] = await Promise.all([loadPhotos({ album: album.id }), loadAlbums(), loadCrew(member.householdId)]);
  const mine = member.role === "owner" || album.created_by === member.id;

  return (
    <>
      <Link href="/portraits" className="text-sm text-muted-foreground hover:underline">
        ← Portraits
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-4xl">{album.title}</h1>
        <p className="text-sm text-muted-foreground">
          {[album.taken_on && onDay(album.taken_on), `${photos.length} ${photos.length === 1 ? "photo" : "photos"}`].filter(Boolean).join(" · ")}
        </p>
        {album.description && <p className="mt-2 max-w-3xl whitespace-pre-wrap font-serif text-lg leading-relaxed">{album.description}</p>}
      </header>

      <PhotoAdder bucket={PHOTO_BUCKET} householdId={member.householdId} save={addPhoto.bind(null, album.id)} />
      <Tiles photos={photos} filter={{ album: album.id }} albums={albums.filter((a) => a.id !== album.id)} crew={crew} />
      <p className="text-sm text-muted-foreground">
        To put photos you&apos;ve already added into this album, pick them in{" "}
        <Link href="/portraits/photos" className="underline">
          All photos
        </Link>{" "}
        and choose this album.
      </p>

      {mine && (
        <details className="max-w-3xl rounded-2xl border bg-card p-5">
          <summary className="cursor-pointer font-medium">Edit album</summary>
          <ActionForm action={saveAlbum.bind(null, album.id)} reset={false} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label htmlFor="title">Name</Label>
              <Input id="title" name="title" required defaultValue={album.title} className="h-11 text-base" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="taken_on">When (optional)</Label>
              <Input id="taken_on" name="taken_on" type="date" defaultValue={album.taken_on ?? ""} className="h-11 text-base" />
            </div>
            <div className="grid gap-1 sm:col-span-2">
              <Label htmlFor="description">About this album (optional)</Label>
              <textarea id="description" name="description" rows={3} defaultValue={album.description ?? ""} className={area} />
            </div>
            <Button size="lg" className="justify-self-start">
              Save
            </Button>
          </ActionForm>
          <ActionForm action={deleteAlbum.bind(null, album.id)} confirm="Delete this album? Its photos stay in All photos." className="mt-6 border-t pt-4">
            <Button variant="ghost" className="text-red-600">
              <Trash2 aria-hidden /> Delete album
            </Button>
          </ActionForm>
        </details>
      )}
    </>
  );
}
