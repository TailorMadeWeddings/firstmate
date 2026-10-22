// Loading Voyage. Reads go through the signed-in user's client, so row-level
// security decides: Captains see every book, Officers only their own stories.
import { type PersonKey, personColumns, personKey } from "@/lib/medical";
import { PHOTO_BUCKET, type TemplateKey, template } from "@/lib/voyage";
import { createClient } from "@/lib/supabase/server";
import { type CrewMember, loadCrew } from "../logbook/data";
import { PHOTO_BUCKET as PORTRAITS_BUCKET } from "../portraits/data";

export type Person = CrewMember & { born: string | null };

export type Entry = {
  id: string;
  profile_id: string | null;
  dependent_id: string | null;
  template: TemplateKey;
  period: number | null;
  title: string | null;
  occurred_on: string | null;
  fields: Record<string, string>;
  body: string | null;
};

export type Note = {
  id: string;
  entry_id: string | null;
  profile_id: string | null;
  dependent_id: string | null;
  title: string | null;
  occurred_on: string | null;
  body: string;
  created_by: string;
  created_at: string;
};

export type Photo = { id: string; url: string | null; created_by: string };

const ENTRY = "id, profile_id, dependent_id, template, period, title, occurred_on, fields, body";
const NOTE = "id, entry_id, profile_id, dependent_id, title, occurred_on, body, created_by, created_at";

const must = <T,>({ data, error }: { data: unknown; error: unknown }): T => {
  if (error) throw error;
  return data as T;
};

/** A book's address: /voyage/d/<id> for a child, /voyage/p/<id> for a Captain. */
export const bookHref = (key: PersonKey) => `/voyage/${key.replace(":", "/")}`;

/** Where a page lives: its person's book (or the age it belongs to), or the family pages. */
export function homeOf(entry: Entry, people: Person[]) {
  if (!entry.profile_id && !entry.dependent_id) return { href: "/voyage/family", label: "The family", person: undefined };
  const person = people.find((p) => p.key === personKey(entry));
  const book = bookHref(personKey(entry));
  const href = template(entry.template).repeat === "year" && entry.period ? `${book}/age/${entry.period}` : book;
  return { href, label: person?.name ?? "Back", person };
}

/** Everyone with a book (the children, then the Captains) and everyone in the crew, for naming who told a story. */
export async function loadPeople(householdId: string): Promise<{ people: Person[]; crew: CrewMember[] }> {
  const supabase = await createClient();
  const [crew, kids, grownUps] = await Promise.all([
    loadCrew(householdId),
    supabase.from("dependents").select("id, date_of_birth").eq("household_id", householdId),
    // Row-level security: household-mates' profiles only.
    supabase.from("profiles").select("id, date_of_birth"),
  ]);
  type Row = { id: string; date_of_birth: string | null };
  const born = new Map<string, string | null>([
    ...must<Row[]>(kids).map((k) => [`d:${k.id}`, k.date_of_birth] as const),
    ...must<Row[]>(grownUps).map((p) => [`p:${p.id}`, p.date_of_birth] as const),
  ]);
  const people = crew
    .filter((c) => c.kind === "dependent" || c.label === "Captain")
    .map((c) => ({ ...c, born: born.get(c.key) ?? null }))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "dependent" ? -1 : 1));
  return { people, crew };
}

const whose = (person: PersonKey) => {
  const { profile_id, dependent_id } = personColumns(person);
  return profile_id ? { col: "profile_id", id: profile_id } : { col: "dependent_id", id: dependent_id! };
};

/** Every page in a person's book, newest dates first. */
export async function loadBook(person: PersonKey): Promise<Entry[]> {
  const supabase = await createClient();
  const w = whose(person);
  return must<Entry[]>(
    await supabase.from("voyage_entries").select(ENTRY).eq(w.col, w.id).order("occurred_on", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
  );
}

/** The family's pages: homes, pets, relatives, shared moments, the years in the world. */
export async function loadFamilyPages(): Promise<Entry[]> {
  const supabase = await createClient();
  return must<Entry[]>(
    await supabase
      .from("voyage_entries")
      .select(ENTRY)
      .is("profile_id", null)
      .is("dependent_id", null)
      .order("occurred_on", { ascending: false, nullsFirst: false })
      .order("period", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
  );
}

export async function loadEntry(id: string): Promise<Entry | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("voyage_entries").select(ENTRY).eq("id", id).maybeSingle();
  return error ? null : (data as Entry | null);
}

/** The page already in a slot ("month 3"), if there is one. */
export async function findSlot(template: TemplateKey, period: number, person: PersonKey | null): Promise<string | null> {
  const supabase = await createClient();
  let q = supabase.from("voyage_entries").select("id").eq("template", template).eq("period", period);
  if (person) {
    const w = whose(person);
    q = q.eq(w.col, w.id);
  } else q = q.is("profile_id", null).is("dependent_id", null);
  const { data } = await q.maybeSingle();
  return data?.id ?? null;
}

/** Each person's section of a family page. */
export async function loadSections(entryId: string): Promise<Note[]> {
  const supabase = await createClient();
  return must<Note[]>(await supabase.from("voyage_notes").select(NOTE).eq("entry_id", entryId));
}

/** The family pages with a section about this person, with that section. */
export async function loadMentions(person: PersonKey): Promise<(Note & { entry: Pick<Entry, "template" | "title" | "period" | "occurred_on"> })[]> {
  const supabase = await createClient();
  const w = whose(person);
  type Row = Note & { voyage_entries: Pick<Entry, "template" | "title" | "period" | "occurred_on"> | null };
  const rows = must<Row[]>(
    await supabase.from("voyage_notes").select(`${NOTE}, voyage_entries(template, title, period, occurred_on)`).eq(w.col, w.id).not("entry_id", "is", null),
  );
  return rows.flatMap(({ voyage_entries, ...n }) => (voyage_entries ? [{ ...n, entry: voyage_entries }] : []));
}

/** Stories told about people: every one for a Captain, only their own for an Officer. Optionally about one person. */
export async function loadStories(person?: PersonKey): Promise<Note[]> {
  const supabase = await createClient();
  let q = supabase.from("voyage_notes").select(NOTE).is("entry_id", null);
  if (person) {
    const w = whose(person);
    q = q.eq(w.col, w.id);
  }
  return must<Note[]>(await q.order("occurred_on", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }));
}

export async function loadStory(id: string): Promise<Note | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("voyage_notes").select(NOTE).eq("id", id).is("entry_id", null).maybeSingle();
  return (data as Note | null) ?? null;
}

/** Photos on pages or stories (their own uploads, or picked from Portraits), by what they're on, oldest first, with short-lived links. */
/** How many school updates each child's book has. */
export async function countSchoolUpdates(): Promise<Map<PersonKey, number>> {
  const supabase = await createClient();
  const rows = must<{ dependent_id: string }[]>(await supabase.from("voyage_entries").select("dependent_id").eq("template", "school-update").not("dependent_id", "is", null));
  const counts = new Map<PersonKey, number>();
  for (const { dependent_id } of rows) counts.set(`d:${dependent_id}`, (counts.get(`d:${dependent_id}`) ?? 0) + 1);
  return counts;
}

/** Photos on pages or stories, by what they're on, oldest first, with short-lived links. */
export async function loadPhotos(column: "entry_id" | "note_id", ids: string[]): Promise<Map<string, Photo[]>> {
  const out = new Map<string, Photo[]>();
  if (ids.length === 0) return out;
  const supabase = await createClient();
  type Row = { id: string; path: string | null; created_by: string; entry_id: string | null; note_id: string | null; portrait_photos: { path: string } | null };
  const rows = must<Row[]>(
    await supabase.from("voyage_photos").select("id, path, created_by, entry_id, note_id, portrait_photos(path)").in(column, ids).order("created_at"),
  );
  if (rows.length === 0) return out;
  const sign = async (bucket: string, paths: string[]) => {
    if (paths.length === 0) return [];
    const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 60 * 60);
    return (data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : []));
  };
  const [own, portraits] = await Promise.all([
    sign(PHOTO_BUCKET, rows.flatMap((r) => r.path ?? [])),
    sign(PORTRAITS_BUCKET, rows.flatMap((r) => r.portrait_photos?.path ?? [])),
  ]);
  const urls = new Map([...own, ...portraits]);
  for (const r of rows) {
    const key = r[column]!;
    const path = r.path ?? r.portrait_photos?.path;
    out.set(key, [...(out.get(key) ?? []), { id: r.id, url: (path && urls.get(path)) ?? null, created_by: r.created_by }]);
  }
  return out;
}
