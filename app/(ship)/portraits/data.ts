// Loading Portraits through the signed-in user's client: row-level security
// shows the crew every photo and album in the household.
import { type PersonKey, personColumns, personKey } from "@/lib/medical";
import type { Filter } from "@/lib/portraits";
import { createClient } from "@/lib/supabase/server";

export const PHOTO_BUCKET = "portrait-photos";

export type Album = { id: string; title: string; taken_on: string | null; description: string | null; cover_photo_id: string | null; created_by: string };
export type AlbumCard = Album & { count: number; cover: string | null };
export type Photo = { id: string; url: string | null; caption: string | null; taken_on: string; created_by: string };
export type PhotoDetail = Photo & { people: PersonKey[]; words: string[]; albums: string[] };

const ALBUM = "id, title, taken_on, description, cover_photo_id, created_by";
const PHOTO = "id, path, caption, taken_on, created_by";

type Client = Awaited<ReturnType<typeof createClient>>;
type PhotoRow = { id: string; path: string; caption: string | null; taken_on: string; created_by: string };

const must = <T,>({ data, error }: { data: unknown; error: unknown }): T => {
  if (error) throw error;
  return data as T;
};

/** Short-lived links to private photos, by path. */
async function sign(supabase: Client, paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 60 * 60);
  return new Map((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])));
}

const withUrls = async (supabase: Client, rows: PhotoRow[], signed = true): Promise<Photo[]> => {
  const urls = signed ? await sign(supabase, rows.map((r) => r.path)) : new Map<string, string>();
  return rows.map(({ path, ...r }) => ({ ...r, url: urls.get(path) ?? null }));
};

/** Every album, newest first, with how many photos it has and its cover (chosen, or the first added). */
export async function loadAlbums(): Promise<AlbumCard[]> {
  const supabase = await createClient();
  type Row = Album & { photos: { count: number }[]; chosen: { path: string } | null; first: { portrait_photos: { path: string } | null }[] };
  // The cover when none is chosen: the first photo put in the album.
  const rows = must<Row[]>(
    await supabase
      .from("portrait_albums")
      .select(`${ALBUM}, photos:portrait_album_photos(count), chosen:portrait_photos!cover_photo_id(path), first:portrait_album_photos(portrait_photos(path))`)
      .order("added_at", { referencedTable: "first" })
      .limit(1, { referencedTable: "first" })
      .order("taken_on", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
  );
  const coverPath = (r: Row) => r.chosen?.path ?? r.first[0]?.portrait_photos?.path ?? null;
  const urls = await sign(supabase, rows.flatMap((r) => coverPath(r) ?? []));
  return rows.map(({ photos, chosen, first, ...a }) => {
    const path = coverPath({ photos, chosen, first, ...a });
    return { ...a, count: photos[0]?.count ?? 0, cover: path ? (urls.get(path) ?? null) : null };
  });
}

export async function loadAlbum(id: string): Promise<Album | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("portrait_albums").select(ALBUM).eq("id", id).maybeSingle();
  return error ? null : (data as Album | null);
}

/**
 * The photos a filter picks, with short-lived links (unless not `signed`):
 * an album's in the order they were taken, everything else newest first.
 */
export async function loadPhotos(filter: Filter, signed = true): Promise<Photo[]> {
  const supabase = await createClient();
  const join = "album" in filter ? ", portrait_album_photos!inner(album_id)" : "person" in filter || "word" in filter ? ", portrait_tags!inner(id)" : "";
  let q = supabase.from("portrait_photos").select(PHOTO + join);
  if ("album" in filter) q = q.eq("portrait_album_photos.album_id", filter.album);
  else if ("person" in filter) {
    const { profile_id, dependent_id } = personColumns(filter.person);
    q = profile_id ? q.eq("portrait_tags.profile_id", profile_id) : q.eq("portrait_tags.dependent_id", dependent_id!);
  } else if ("word" in filter) q = q.eq("portrait_tags.word", filter.word);
  const ascending = "album" in filter;
  // ponytail: one page of everything; paginate once the family passes ~1000 photos.
  const rows = must<PhotoRow[]>(await q.order("taken_on", { ascending }).order("created_at", { ascending }).order("id"));
  return withUrls(supabase, rows, signed);
}

/** Photos taken on this day in earlier years. */
export async function loadOnThisDay(today: string): Promise<Photo[]> {
  const supabase = await createClient();
  return withUrls(supabase, must<PhotoRow[]>(await supabase.rpc("portraits_on_this_day", { p_today: today })));
}

/** Up to `n` photos picked at random, with fresh links: the kitchen screen's slideshow. */
export async function loadRandomPhotos(n: number): Promise<Photo[]> {
  const supabase = await createClient();
  // ponytail: picks from the newest 1000; an RPC with order by random() if the family outgrows that.
  const rows = must<PhotoRow[]>(await supabase.from("portrait_photos").select(PHOTO).order("created_at", { ascending: false }).limit(1000));
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  return withUrls(supabase, rows.slice(0, n));
}

/** One photo, with who's in it, its words and the albums it's in. */
export async function loadPhoto(id: string): Promise<PhotoDetail | null> {
  const supabase = await createClient();
  type Row = PhotoRow & {
    portrait_tags: { profile_id: string | null; dependent_id: string | null; word: string | null }[];
    portrait_album_photos: { album_id: string }[];
  };
  const { data, error } = await supabase
    .from("portrait_photos")
    .select(`${PHOTO}, portrait_tags(profile_id, dependent_id, word), portrait_album_photos(album_id)`)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const { portrait_tags: tags, portrait_album_photos: albums, ...row } = data as Row;
  const [photo] = await withUrls(supabase, [row]);
  return {
    ...photo,
    people: tags.filter((t) => !t.word).map(personKey),
    words: tags.flatMap((t) => t.word ?? []).sort(),
    albums: albums.map((a) => a.album_id),
  };
}

// ponytail: the next two count tags in JS; a grouped view once there are thousands.

/** Every word used to tag a photo, with how many photos have it, most used first. */
export async function loadWords(): Promise<{ word: string; count: number }[]> {
  const supabase = await createClient();
  const rows = must<{ word: string }[]>(await supabase.from("portrait_tags").select("word").not("word", "is", null));
  const counts = new Map<string, number>();
  for (const { word } of rows) counts.set(word, (counts.get(word) ?? 0) + 1);
  return [...counts].map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

/** Who has been tagged in a photo, with how many photos each. */
export async function loadTaggedPeople(): Promise<Map<PersonKey, number>> {
  const supabase = await createClient();
  const rows = must<{ profile_id: string | null; dependent_id: string | null }[]>(
    await supabase.from("portrait_tags").select("profile_id, dependent_id").is("word", null),
  );
  const counts = new Map<PersonKey, number>();
  for (const r of rows) counts.set(personKey(r), (counts.get(personKey(r)) ?? 0) + 1);
  return counts;
}
