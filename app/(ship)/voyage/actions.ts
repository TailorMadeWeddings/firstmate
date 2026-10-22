"use server";

// Saving Voyage, through the signed-in user's own client: row-level security
// lets Captains keep the books and Officers keep the stories they told.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type PersonKey, isPersonKey, personColumns } from "@/lib/medical";
import { currentVoyageCaptain, currentVoyageMember } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";
import { PHOTO_BUCKET, type TemplateKey, fieldsFor, isTemplate, periodProblem, template } from "@/lib/voyage";
import { bookHref } from "./data";

type Result = string | null;

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const done = () => revalidatePath("/voyage", "layout");
const SAVE_FAILED = "Couldn't save that. Try again.";

function failed(error: { code?: string; message?: string }): string {
  if (error.code === "42501") return "Only a Captain can change the books, and only for people in the household.";
  if (error.code === "23505") return "There's already a page for that. Open it from the book.";
  console.error(error);
  return SAVE_FAILED;
}

/** What was typed into a page, checked against its template. */
function readPage(key: TemplateKey, period: number | null, form: FormData) {
  const t = template(key);
  const fields: Record<string, string> = {};
  for (const f of fieldsFor(key, period)) {
    const raw = text(form, `f_${f.name}`);
    if (!raw) continue;
    if (f.type === "number" && !(Number.parseFloat(raw) > 0)) return `“${f.label}” needs a number.`;
    if (f.type === "date" && !isDay(raw)) return `“${f.label}” needs a date.`;
    if (f.type === "time" && !/^\d{2}:\d{2}$/.test(raw)) return `“${f.label}” needs a time.`;
    fields[f.name] = f.type === "number" ? String(Number.parseFloat(raw)) : raw;
  }
  const title = t.titleLabel ? text(form, "title") : "";
  if (t.titleLabel && !title) return `Fill in “${t.titleLabel}”.`;
  const occurred = t.dateLabel ? text(form, "occurred_on") : "";
  if (occurred && !isDay(occurred)) return `“${t.dateLabel}” needs a date.`;
  return { fields, title: title || null, occurred_on: occurred || null, body: (t.bodyLabel && text(form, "body")) || null };
}

/** A new page, or changes to one. Family pages have no person. */
export async function savePage(entryId: string | null, key: string, person: PersonKey | null, period: number | null, _: Result, form: FormData): Promise<Result> {
  const member = await currentVoyageCaptain();
  if (!isTemplate(key)) return "That kind of page doesn't exist.";
  if (Boolean(template(key).family) !== (person === null) || (person !== null && !isPersonKey(person))) return "Pick whose page this is.";
  const problem = periodProblem(key, period);
  if (problem) return problem;
  const page = readPage(key, period, form);
  if (typeof page === "string") return page;
  const supabase = await createClient();
  const { data, error } = entryId
    ? await supabase.from("voyage_entries").update(page).eq("id", entryId).select("id").single()
    : await supabase
        .from("voyage_entries")
        .insert({ ...page, ...(person ? personColumns(person) : {}), household_id: member.householdId, template: key, period })
        .select("id")
        .single();
  if (error) return failed(error);
  done();
  redirect(`/voyage/page/${data.id}`);
}

/**
 * Removes the files behind some photos, before their rows go (storage checks
 * the row is still there). Photos picked from Portraits have no file of their
 * own (no path): they stay in Portraits.
 */
async function removeFiles(supabase: Awaited<ReturnType<typeof createClient>>, paths: (string | null)[]) {
  const own = paths.filter((p) => p !== null);
  if (own.length) await supabase.storage.from(PHOTO_BUCKET).remove(own);
}

export async function deletePage(entryId: string): Promise<Result> {
  await currentVoyageCaptain();
  const supabase = await createClient();
  const { data: entry } = await supabase.from("voyage_entries").select("profile_id, dependent_id").eq("id", entryId).maybeSingle();
  if (!entry) return "That page is already gone.";
  const { data: sections } = await supabase.from("voyage_notes").select("id").eq("entry_id", entryId);
  const noteIds = (sections ?? []).map((n) => n.id);
  const { data: photos } = await supabase
    .from("voyage_photos")
    .select("path")
    .or([`entry_id.eq.${entryId}`, ...(noteIds.length ? [`note_id.in.(${noteIds.join(",")})`] : [])].join(","));
  await removeFiles(supabase, (photos ?? []).map((p) => p.path));
  const { error } = await supabase.from("voyage_entries").delete().eq("id", entryId);
  if (error) return failed(error);
  done();
  redirect(entry.profile_id || entry.dependent_id ? bookHref(entry.profile_id ? `p:${entry.profile_id}` : `d:${entry.dependent_id}`) : "/voyage/family");
}

/** One person's section of a family page. Emptying it removes it. */
export async function saveSection(entryId: string, person: PersonKey, _: Result, form: FormData): Promise<Result> {
  const member = await currentVoyageCaptain();
  if (!isPersonKey(person)) return "Pick who this is about.";
  const body = text(form, "body");
  const who = personColumns(person);
  const supabase = await createClient();
  const col = who.profile_id ? "profile_id" : "dependent_id";
  const { data: existing } = await supabase.from("voyage_notes").select("id").eq("entry_id", entryId).eq(col, who.profile_id ?? who.dependent_id!).maybeSingle();
  const { error } = !body
    ? existing
      ? await supabase.from("voyage_notes").delete().eq("id", existing.id)
      : { error: null }
    : existing
      ? await supabase.from("voyage_notes").update({ body }).eq("id", existing.id)
      : await supabase.from("voyage_notes").insert({ ...who, household_id: member.householdId, entry_id: entryId, body });
  if (error) return failed(error);
  done();
  return null;
}

/** A story about someone, from anyone in the crew. */
export async function saveStory(storyId: string | null, _: Result, form: FormData): Promise<Result> {
  const member = await currentVoyageMember();
  const person = text(form, "person");
  if (!isPersonKey(person)) return "Pick who the story is about.";
  const body = text(form, "body");
  if (!body) return "Write the story.";
  const occurred = text(form, "occurred_on");
  if (occurred && !isDay(occurred)) return "The date needs to be a date.";
  const story = { ...personColumns(person), title: text(form, "title") || null, occurred_on: occurred || null, body };
  const supabase = await createClient();
  const { error } = storyId
    ? await supabase.from("voyage_notes").update(story).eq("id", storyId).is("entry_id", null).select("id").single()
    : await supabase.from("voyage_notes").insert({ ...story, household_id: member.householdId });
  if (error) {
    if (error.code === "42501") return "Stories can be about the children and the Captains.";
    console.error(error);
    return SAVE_FAILED;
  }
  done();
  if (storyId) redirect("/voyage/stories");
  return null;
}

export async function deleteStory(storyId: string): Promise<Result> {
  await currentVoyageMember();
  const supabase = await createClient();
  const { data: photos } = await supabase.from("voyage_photos").select("path").eq("note_id", storyId);
  await removeFiles(supabase, (photos ?? []).map((p) => p.path));
  const { error } = await supabase.from("voyage_notes").delete().eq("id", storyId).is("entry_id", null);
  if (error) return failed(error);
  done();
  return null;
}

/** Records a photo just uploaded to <household>/…, on a page or a story. */
export async function addPhoto(on: { entry_id: string } | { note_id: string }, path: string): Promise<Result> {
  const member = await currentVoyageMember();
  if (!new RegExp(`^${member.householdId}/[0-9a-f-]{36}\\.jpg$`).test(path)) return "Couldn't save that photo.";
  const supabase = await createClient();
  const { error } = await supabase.from("voyage_photos").insert({ ...on, household_id: member.householdId, path });
  if (error) return failed(error);
  done();
  return null;
}

export async function deletePhoto(photoId: string): Promise<Result> {
  await currentVoyageMember();
  const supabase = await createClient();
  const { data: photo } = await supabase.from("voyage_photos").select("path").eq("id", photoId).maybeSingle();
  if (!photo) return null;
  await removeFiles(supabase, [photo.path]);
  const { error } = await supabase.from("voyage_photos").delete().eq("id", photoId);
  if (error) return failed(error);
  done();
  return null;
}

/** A Captain's birthday, so their book knows how old they were. (Children's are on the Crew page.) */
export async function setBirthday(profileId: string, _: Result, form: FormData): Promise<Result> {
  await currentVoyageCaptain();
  const born = text(form, "born");
  if (!isDay(born)) return "Pick a date.";
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ date_of_birth: born }).eq("id", profileId).select("id").single();
  if (error) return failed(error);
  done();
  return null;
}

/** Photos picked from Portraits, shown on a page or a story; then back to it. */
export async function addFromPortraits(on: { entry_id: string } | { note_id: string }, _: Result, form: FormData): Promise<Result> {
  const member = await currentVoyageMember();
  const picked = form.getAll("photos").map(String).filter((id) => /^[0-9a-f-]{36}$/.test(id));
  if (picked.length === 0) return "Pick some photos first.";
  const supabase = await createClient();
  const [col, id] = "entry_id" in on ? (["entry_id", on.entry_id] as const) : (["note_id", on.note_id] as const);
  const { data: there } = await supabase.from("voyage_photos").select("portrait_photo_id").eq(col, id).not("portrait_photo_id", "is", null);
  const already = new Set((there ?? []).map((t) => t.portrait_photo_id));
  const rows = picked.filter((p) => !already.has(p)).map((portrait_photo_id) => ({ ...on, household_id: member.householdId, portrait_photo_id }));
  if (rows.length) {
    const { error } = await supabase.from("voyage_photos").insert(rows);
    if (error) return failed(error);
  }
  done();
  redirect("entry_id" in on ? `/voyage/page/${on.entry_id}` : `/voyage/stories#${on.note_id}`);
}
