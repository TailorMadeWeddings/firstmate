"use server";

// Saving Portraits, through the signed-in user's own client: row-level
// security lets the crew upload, caption, tag and file photos, a Captain or
// whoever made an album change it, and a Captain or whoever uploaded a photo
// delete it. Once a photo's row is gone, the admin client removes its file
// (storage's own policies would need the row).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseTags } from "@/lib/galley";
import { isPersonKey, personColumns } from "@/lib/medical";
import { currentCrew, currentMember } from "@/lib/players";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PHOTO_BUCKET, type Photo, loadRandomPhotos } from "./data";

type Result = string | null;

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const done = () => revalidatePath("/portraits", "layout");

function failed(error: { code?: string; message?: string }): string {
  if (error.code === "42501" || error.code === "PGRST116") return "Only a Captain, or whoever added it, can change that.";
  console.error(error);
  return "Couldn't save that. Try again.";
}

/** A new album (then off to it), or changes to one. */
export async function saveAlbum(albumId: string | null, _: Result, form: FormData): Promise<Result> {
  const member = await currentCrew();
  const title = text(form, "title");
  if (!title) return "Give the album a name.";
  const taken = text(form, "taken_on");
  if (taken && !isDay(taken)) return "The date needs to be a date.";
  const album = { title, taken_on: taken || null, ...(form.has("description") ? { description: text(form, "description") || null } : {}) };
  const supabase = await createClient();
  const { data, error } = albumId
    ? await supabase.from("portrait_albums").update(album).eq("id", albumId).select("id").single()
    : await supabase.from("portrait_albums").insert({ ...album, household_id: member.householdId }).select("id").single();
  if (error) return failed(error);
  done();
  if (!albumId) redirect(`/portraits/${data.id}`);
  return null;
}

/** An album. Its photos stay, in their other albums and in All photos. */
export async function deleteAlbum(albumId: string): Promise<Result> {
  await currentCrew();
  const supabase = await createClient();
  const { error } = await supabase.from("portrait_albums").delete().eq("id", albumId).select("id").single();
  if (error) return failed(error);
  done();
  redirect("/portraits");
}

/** The photo on an album's card; null goes back to the first one added. */
export async function setCover(albumId: string, photoId: string | null): Promise<Result> {
  await currentCrew();
  const supabase = await createClient();
  const { error } = await supabase.from("portrait_albums").update({ cover_photo_id: photoId }).eq("id", albumId).select("id").single();
  if (error) return failed(error);
  done();
  return null;
}

/** Records a photo just uploaded to <household>/…, in an album if given, taken on the day its file says (else today). */
export async function addPhoto(albumId: string | null, path: string, takenOn: string | null): Promise<Result> {
  const member = await currentCrew();
  if (!new RegExp(`^${member.householdId}/[0-9a-f-]{36}\\.jpg$`).test(path)) return "Couldn't save that photo.";
  const supabase = await createClient();
  const photo = { household_id: member.householdId, path, ...(takenOn && isDay(takenOn) ? { taken_on: takenOn } : {}) };
  const { data, error } = await supabase.from("portrait_photos").insert(photo).select("id").single();
  if (error) return failed(error);
  if (albumId) {
    const { error: filed } = await supabase.from("portrait_album_photos").insert({ album_id: albumId, photo_id: data.id, household_id: member.householdId });
    if (filed) {
      // This upload's own row and file: undo both, so it doesn't turn up unfiled.
      await supabase.from("portrait_photos").delete().eq("id", data.id);
      await createAdminClient().storage.from(PHOTO_BUCKET).remove([path]);
      return failed(filed);
    }
  }
  done();
  return null;
}

/** A photo's caption, when it was taken, who's in it, its words and its albums, as ticked on the form. */
export async function savePhoto(photoId: string, _: Result, form: FormData): Promise<Result> {
  const member = await currentCrew();
  const people = form.getAll("people").map(String).filter(isPersonKey);
  const words = parseTags(text(form, "words"));
  if (words.some((w) => w.length > 40)) return "Keep each tag under 40 letters.";
  const albums = form.getAll("albums").map(String).filter(isId);
  const supabase = await createClient();
  const household_id = member.householdId;

  const taken = text(form, "taken_on");
  if (!isDay(taken)) return "Pick the day it was taken.";
  const { error } = await supabase.from("portrait_photos").update({ caption: text(form, "caption") || null, taken_on: taken }).eq("id", photoId).select("id").single();
  if (error) return failed(error);

  // ponytail: tags are replaced wholesale; fine while a photo has a handful.
  const { error: cleared } = await supabase.from("portrait_tags").delete().eq("photo_id", photoId);
  if (cleared) return failed(cleared);
  const tags = [...people.map((p) => ({ ...personColumns(p), word: null })), ...words.map((word) => ({ profile_id: null, dependent_id: null, word }))];
  if (tags.length) {
    const { error: tagged } = await supabase.from("portrait_tags").insert(tags.map((t) => ({ ...t, photo_id: photoId, household_id })));
    if (tagged) return failed(tagged);
  }

  const { data: filed } = await supabase.from("portrait_album_photos").select("album_id").eq("photo_id", photoId);
  const before = (filed ?? []).map((f) => f.album_id);
  const out = before.filter((a) => !albums.includes(a));
  const added = albums.filter((a) => !before.includes(a));
  if (out.length) {
    const { error: e } = await supabase.from("portrait_album_photos").delete().eq("photo_id", photoId).in("album_id", out);
    if (e) return failed(e);
  }
  if (added.length) {
    const { error: e } = await supabase.from("portrait_album_photos").insert(added.map((album_id) => ({ album_id, photo_id: photoId, household_id })));
    if (e) return failed(e);
  }
  done();
  return null;
}

/** Adds people, words and an album to several photos at once. Nothing already there is taken away. */
export async function tagPhotos(_: Result, form: FormData): Promise<Result> {
  const member = await currentCrew();
  const ids = form.getAll("ids").map(String).filter(isId);
  const people = form.getAll("people").map(String).filter(isPersonKey);
  const words = parseTags(text(form, "words"));
  if (words.some((w) => w.length > 40)) return "Keep each tag under 40 letters.";
  const album = text(form, "album");
  if (ids.length === 0) return "Pick some photos first.";
  if (people.length + words.length === 0 && !album) return "Pick someone, type a tag, or choose an album.";
  const household_id = member.householdId;
  const supabase = await createClient();
  const tags = ids.flatMap((photo_id) => [
    ...people.map((p) => ({ ...personColumns(p), word: null, photo_id, household_id })),
    ...words.map((word) => ({ profile_id: null, dependent_id: null, word, photo_id, household_id })),
  ]);
  if (tags.length) {
    const { error } = await supabase.from("portrait_tags").upsert(tags, { onConflict: "photo_id,profile_id,dependent_id,word", ignoreDuplicates: true });
    if (error) return failed(error);
  }
  if (isId(album)) {
    const links = ids.map((photo_id) => ({ album_id: album, photo_id, household_id }));
    const { error } = await supabase.from("portrait_album_photos").upsert(links, { onConflict: "album_id,photo_id", ignoreDuplicates: true });
    if (error) return failed(error);
  }
  done();
  return null;
}

/** Takes photos out of one album (they stay everywhere else), then back to the album if `leave`. */
export async function removeFromAlbum(albumId: string, photoIds: string[], leave: boolean): Promise<Result> {
  await currentCrew();
  const supabase = await createClient();
  const { error } = await supabase.from("portrait_album_photos").delete().eq("album_id", albumId).in("photo_id", photoIds.filter(isId));
  if (error) return failed(error);
  done();
  if (leave) redirect(`/portraits/${albumId}`);
  return null;
}

/** A photo, from every album, then back to where it was opened from. */
export async function deletePhoto(photoId: string, back: string): Promise<Result> {
  await currentCrew();
  const supabase = await createClient();
  const { data, error } = await supabase.from("portrait_photos").delete().eq("id", photoId).select("path").single();
  if (error) return failed(error);
  await createAdminClient().storage.from(PHOTO_BUCKET).remove([data.path]);
  done();
  redirect(back.startsWith("/portraits") ? back : "/portraits");
}

/** Photos for the kitchen screen's slideshow, with fresh links each time it starts. Nothing for guests. */
export async function slideshowPhotos(): Promise<Pick<Photo, "url" | "caption" | "taken_on">[]> {
  const member = await currentMember();
  if (member.role === "guest") return [];
  return (await loadRandomPhotos(40)).flatMap((p) => (p.url ? [{ url: p.url, caption: p.caption, taken_on: p.taken_on }] : []));
}
