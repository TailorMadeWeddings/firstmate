// School updates: what childcare and school sent home (Storypark), kept as
// pages in a child's Voyage book. Each photo is kept once, in Portraits,
// tagged with the child and "school-photography", and the update shows it
// from there. A photo Portraits already has (twins in the same story) isn't
// kept again: it's tagged with the next child too. Used by the import button
// (the signed-in client) and the one-off seed (the admin client).
import type { SupabaseClient } from "@supabase/supabase-js";

export const SCHOOL_UPDATE = "school-update";
export const SCHOOL_TAG = "school-photography";
export const PORTRAITS_BUCKET = "portrait-photos";

export type UpdateStory = { title: string; date: string | null; body: string };
/** A photo: its file's SHA-256, and where it was just uploaded (null when Portraits already has it). */
export type UpdatePhoto = { sha256: string; path: string | null };
/** Whose book, and (for the admin client, which has no signed-in user) who it's from. */
export type UpdateFor = { household: string; dependent: string; by?: string };
type Failure = { code?: string; message?: string };

/** What makes an update the same one again: its title and date. */
export const updateKey = (title: string | null, date: string | null) => `${(title ?? "").trim().toLowerCase()}|${date}`;

/** The school updates already in a child's book, by updateKey. */
export async function importedUpdates(db: SupabaseClient, dependent: string): Promise<Set<string>> {
  const { data, error } = await db.from("voyage_entries").select("title, occurred_on").eq("dependent_id", dependent).eq("template", SCHOOL_UPDATE);
  if (error) throw error;
  return new Set(data.map((e) => updateKey(e.title, e.occurred_on)));
}

/** The photos Portraits already has, by SHA-256, with their ids. */
export async function knownPhotos(db: SupabaseClient, household: string, hashes: string[]): Promise<Map<string, string>> {
  const known = new Map<string, string>();
  // A few at a time: they go in the address.
  for (let i = 0; i < hashes.length; i += 50) {
    const { data, error } = await db.from("portrait_photos").select("id, sha256").eq("household_id", household).in("sha256", hashes.slice(i, i + 50));
    if (error) throw error;
    for (const p of data) known.set(p.sha256, p.id);
  }
  return known;
}

/**
 * One update and its photos, all or nothing: on failure the rows it made are
 * undone and the error returned. Files just uploaded are the caller's to remove.
 */
export async function saveUpdate(db: SupabaseClient, to: UpdateFor, story: UpdateStory, photos: UpdatePhoto[]): Promise<Failure | null> {
  const by = to.by ? { created_by: to.by } : {};
  const made: string[] = [];
  let entryId: string | null = null;
  const undo = async (e: Failure) => {
    // Their tags and the update's links to them go with the photos.
    if (made.length) await db.from("portrait_photos").delete().in("id", made);
    if (entryId) await db.from("voyage_entries").delete().eq("id", entryId);
    return e;
  };

  const { data: entry, error } = await db
    .from("voyage_entries")
    .insert({
      household_id: to.household,
      dependent_id: to.dependent,
      template: SCHOOL_UPDATE,
      period: null,
      title: story.title.trim().slice(0, 300) || "School update",
      occurred_on: story.date,
      body: story.body.slice(0, 20000) || null,
      ...by,
    })
    .select("id")
    .single();
  if (error) return error;
  entryId = entry.id;
  if (photos.length === 0) return null;

  try {
    const ids = await knownPhotos(db, to.household, photos.filter((p) => !p.path).map((p) => p.sha256));
    const fresh = photos.filter((p) => p.path);
    if (fresh.length) {
      const { data, error: added } = await db
        .from("portrait_photos")
        .insert(fresh.map((p) => ({ household_id: to.household, path: p.path, sha256: p.sha256, caption: story.title.slice(0, 2000), ...(story.date ? { taken_on: story.date } : {}), ...by })))
        .select("id, sha256");
      if (added) return undo(added);
      for (const p of data) {
        made.push(p.id);
        ids.set(p.sha256, p.id);
      }
    }
    const order = photos.map((p) => ids.get(p.sha256));
    if (order.some((id) => !id)) return undo({ message: "a photo isn't in Portraits" });
    const { error: tagged } = await db.from("portrait_tags").upsert(
      order.flatMap((photo_id) => [
        { household_id: to.household, photo_id, dependent_id: to.dependent, word: null },
        { household_id: to.household, photo_id, dependent_id: null, word: SCHOOL_TAG },
      ]),
      { onConflict: "photo_id,profile_id,dependent_id,word", ignoreDuplicates: true },
    );
    if (tagged) return undo(tagged);
    const { error: linked } = await db.from("voyage_photos").insert(order.map((portrait_photo_id) => ({ household_id: to.household, entry_id: entryId, portrait_photo_id, ...by })));
    if (linked) return undo(linked);
    return null;
  } catch (e) {
    return undo(e as Failure);
  }
}
