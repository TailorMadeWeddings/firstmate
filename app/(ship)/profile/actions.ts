"use server";

// Your own profile: details, photo, and calendars in and out. Writes use
// your own client, so row-level security keeps them to you; only reading a
// calendar in uses the secret key (see logbook/feeds.ts).
import { revalidatePath } from "next/cache";
import { feedUrl } from "@/lib/calendars";
import { hashKey } from "@/lib/health";
import { newSecret } from "@/lib/oauth";
import { PROFILE_PHOTO_BUCKET } from "@/lib/photos";
import { currentProfileMember } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";
import { syncFeed } from "../logbook/feeds";

type Result = string | null;

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const done = () => revalidatePath("/", "layout");

function failed(error: { code?: string; message?: string }): string {
  console.error(error);
  return "Couldn't save that. Try again.";
}

export async function saveProfile(_: Result, form: FormData): Promise<Result> {
  const member = await currentProfileMember();
  const name = text(form, "name");
  const color = text(form, "color").toLowerCase();
  const phone = text(form, "phone");
  const born = text(form, "date_of_birth");
  if (!name || name.length > 60) return "Give yourself a name (60 letters at most).";
  if (!/^#[0-9a-f]{6}$/.test(color)) return "Pick a colour.";
  if (phone && !/^\+?[\d\s()-]{6,30}$/.test(phone)) return "That doesn't look like a phone number.";
  if (born && (!/^\d{4}-\d{2}-\d{2}$/.test(born) || born > new Date().toISOString().slice(0, 10))) return "Pick your birthday, or leave it empty.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: name, color, phone: phone || null, date_of_birth: born || null })
    .eq("id", member.id)
    .select("id")
    .single();
  if (error) return failed(error);
  done();
  return null;
}

// The browser shrinks the photo and uploads it straight to storage (as you,
// so storage's own policies apply); this records which one is current.
export async function setProfilePhoto(path: string | null): Promise<Result> {
  const member = await currentProfileMember();
  if (path !== null && !path.startsWith(`${member.id}/`)) return "That photo belongs to someone else.";
  const supabase = await createClient();
  const { data: before } = await supabase.from("profiles").select("photo_path").eq("id", member.id).single();
  const { error } = await supabase.from("profiles").update({ photo_path: path }).eq("id", member.id).select("id").single();
  if (error) return failed(error);
  if (before?.photo_path && before.photo_path !== path) await supabase.storage.from(PROFILE_PHOTO_BUCKET).remove([before.photo_path]);
  done();
  return null;
}

// ---------- calendars in ----------

/** Adds another calendar by its ICS link, and reads it straight away so a bad link says so now. */
export async function addFeed(_: Result, form: FormData): Promise<Result> {
  const member = await currentProfileMember();
  const name = text(form, "name") || "Calendar";
  const url = feedUrl(text(form, "url"));
  if (name.length > 60) return "Give it a shorter name.";
  if (!url) return "Paste the calendar's ICS link: it starts with https:// or webcal://.";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calendar_feeds")
    .insert({ household_id: member.householdId, profile_id: member.id, name, url, synced_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error) return failed(error);
  const problem = await syncFeed(data.id, url);
  if (problem) {
    await supabase.from("calendar_feeds").delete().eq("id", data.id);
    return problem;
  }
  done();
  return null;
}

/** Stops reading a calendar in; its events leave the Logbook with it. */
export async function removeFeed(feedId: string): Promise<Result> {
  await currentProfileMember();
  const supabase = await createClient();
  const { error } = await supabase.from("calendar_feeds").delete().eq("id", feedId);
  if (error) return failed(error);
  done();
  return null;
}

// ---------- the Logbook out ----------

/** A new private link to the Logbook for your phone's calendar. Shown once; any old one stops working. */
export async function makeCalendarLink(): Promise<{ key: string } | { error: string }> {
  const member = await currentProfileMember();
  const key = newSecret();
  const supabase = await createClient();
  const { error } = await supabase
    .from("calendar_links")
    .upsert({ profile_id: member.id, household_id: member.householdId, key_hash: hashKey(key), created_at: new Date().toISOString(), last_used_at: null });
  if (error) return { error: failed(error) };
  revalidatePath("/profile");
  return { key };
}

/** Turns the link off; calendars subscribed to it stop updating. */
export async function dropCalendarLink(): Promise<Result> {
  const member = await currentProfileMember();
  const supabase = await createClient();
  const { error } = await supabase.from("calendar_links").delete().eq("profile_id", member.id);
  if (error) return failed(error);
  revalidatePath("/profile");
  return null;
}
