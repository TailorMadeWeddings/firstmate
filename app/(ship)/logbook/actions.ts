"use server";

// Saving and deleting events, and tidying up the crew. Writes use the
// signed-in user's own client, so row-level security decides what's allowed:
// crew add events, Captains change anything, Officers change their own.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type Repeat, type Weekday, WEEKDAYS, addDays, dayKey, fromWall, ruleFor, startOfDay } from "@/lib/logbook";
import { createClient } from "@/lib/supabase/server";
import { currentCrew } from "./data";

type Result = string | null;
/** Which events a change to a repeating event covers. */
export type Scope = "this" | "following" | "all";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s: string) => /^\d{2}:\d{2}$/.test(s);

function problem(error: { code?: string; message: string }): string {
  if (error.code === "P0010") return "Give the event a name.";
  if (error.code === "P0012") return "Pick people from your own household.";
  // Not found or not allowed look the same through row-level security.
  if (error.code === "P0011" || error.code === "42501") {
    return "Only the person who added this (or a Captain) can change it.";
  }
  console.error(error);
  return "Couldn't save that. Try again.";
}

const at = (day: string, time: string) => {
  const [y, m, d] = day.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return fromWall({ y, m, d, h, min });
};

/** The event a form describes, or an error message. */
function eventFrom(form: FormData) {
  const title = text(form, "title");
  const day = text(form, "date");
  const allDay = form.get("all_day") === "on";
  if (!title) return "Give the event a name.";
  if (!isDay(day)) return "Pick a date.";
  let start: Date;
  let end: Date;
  if (allDay) {
    const last = text(form, "end_date") || day;
    if (!isDay(last) || last < day) return "The last day can't be before the first.";
    start = startOfDay(day);
    end = startOfDay(addDays(last, 1));
  } else {
    const from = text(form, "start_time");
    const to = text(form, "end_time");
    if (!isTime(from) || !isTime(to)) return "Pick a start and end time.";
    start = at(day, from);
    end = at(day, to);
    if (end <= start) return "It needs to end after it starts.";
  }
  const repeat = (text(form, "repeat") || "none") as Repeat;
  const days = WEEKDAYS.filter((d) => form.get(`day_${d}`) === "on") as Weekday[];
  const until = text(form, "until");
  if (until && (!isDay(until) || until < day)) return "Repeat until a date after the first one.";
  const who = form.getAll("who").map(String);
  return {
    day,
    title,
    description: text(form, "description") || null,
    location: text(form, "location") || null,
    start,
    end,
    allDay,
    rule: ruleFor(repeat, days, day),
    ruleEnds: until ? startOfDay(addDays(until, 1)) : null,
    profiles: who.filter((k) => k.startsWith("p:")).map((k) => k.slice(2)),
    dependents: who.filter((k) => k.startsWith("d:")).map((k) => k.slice(2)),
  };
}

const back = (day: string) => {
  revalidatePath("/logbook", "layout");
  redirect(`/logbook?date=${day}`);
};

/**
 * Adds an event (eventId null) or changes one. For a repeating event,
 * `occurrence` is the one that was opened and the form's scope says whether
 * the change covers just it, it and the rest, or the whole series.
 */
export async function saveEvent(eventId: string | null, occurrence: string | null, _: Result, form: FormData): Promise<Result> {
  const member = await currentCrew();
  const e = eventFrom(form);
  if (typeof e === "string") return e;
  const supabase = await createClient();
  const scope = (text(form, "scope") || "all") as Scope;

  if (eventId && occurrence && scope === "this") {
    // A one-off change, kept as an exception to the series (who it's for stays the same).
    const { error } = await supabase.from("event_exceptions").upsert(
      {
        parent_event_id: eventId,
        original_start_at: occurrence,
        is_cancelled: false,
        title: e.title,
        description: e.description,
        location: e.location,
        start_at: e.start.toISOString(),
        end_at: e.end.toISOString(),
      },
      { onConflict: "parent_event_id,original_start_at" },
    );
    if (error) return problem(error);
    back(e.day);
  }

  let start = e.start;
  let end = e.end;
  if (eventId && occurrence && scope === "all") {
    // The whole series keeps its first date; the form's times and length apply to all of it.
    const { data: series } = await supabase.from("events").select("start_at").eq("id", eventId).maybeSingle();
    if (!series) return problem({ code: "P0011", message: "not found" });
    const shift = Date.parse(series.start_at) - Date.parse(occurrence);
    start = new Date(e.start.getTime() + shift);
    end = new Date(e.end.getTime() + shift);
  }

  const { error } = await supabase.rpc("logbook_save_event", {
    p_event: eventId,
    p_household: member.householdId,
    p_title: e.title,
    p_description: e.description,
    p_location: e.location,
    p_start: start.toISOString(),
    p_end: end.toISOString(),
    p_all_day: e.allDay,
    p_rule: e.rule,
    p_rule_ends: e.ruleEnds?.toISOString() ?? null,
    p_profiles: e.profiles,
    p_dependents: e.dependents,
    p_split_from: eventId && occurrence && scope === "following" ? occurrence : null,
  });
  if (error) return problem(error);
  back(e.day);
  return null;
}

/** Deletes an event: just one occurrence, it and the rest, or all of it. */
export async function deleteEvent(eventId: string, occurrence: string | null, _: Result, form: FormData): Promise<Result> {
  await currentCrew();
  const supabase = await createClient();
  const scope = (text(form, "scope") || "all") as Scope;
  const { data: series } = await supabase.from("events").select("start_at").eq("id", eventId).maybeSingle();
  if (!series) return problem({ code: "P0011", message: "not found" });
  const day = occurrence ? dayKey(new Date(occurrence)) : dayKey(new Date(series.start_at));

  let error;
  if (occurrence && scope === "this") {
    ({ error } = await supabase
      .from("event_exceptions")
      .upsert({ parent_event_id: eventId, original_start_at: occurrence, is_cancelled: true }, { onConflict: "parent_event_id,original_start_at" }));
  } else if (occurrence && scope === "following" && Date.parse(occurrence) > Date.parse(series.start_at)) {
    ({ error } = await supabase.from("events").update({ recurrence_ends_at: occurrence }).eq("id", eventId).select("id").single());
  } else {
    ({ error } = await supabase.from("events").delete().eq("id", eventId).select("id").single());
  }
  // .single() turns "nothing deleted" (not allowed) into an error too.
  if (error) return problem(error.code === "PGRST116" ? { code: "P0011", message: "not allowed" } : error);
  back(day);
  return null;
}

// ---------- crew ----------

const isColour = (s: string) => /^#[0-9a-f]{6}$/.test(s);

/** Renames or recolours a person (their own profile, or anyone's for a Captain) or a child. */
export async function updateCrew(kind: "profile" | "dependent", id: string, _: Result, form: FormData): Promise<Result> {
  await currentCrew();
  const name = text(form, "name");
  const color = text(form, "color").toLowerCase();
  if (!name) return "Give them a name.";
  if (!isColour(color)) return "Pick a colour.";
  const supabase = await createClient();
  const { error } = await supabase
    .from(kind === "profile" ? "profiles" : "dependents")
    .update({ display_name: name, color })
    .eq("id", id)
    .select("id")
    .single();
  if (error) return error.code === "PGRST116" ? "Only Captains can change other people's details." : problem(error);
  revalidatePath("/", "layout");
  return null;
}

export async function addChild(_: Result, form: FormData): Promise<Result> {
  const member = await currentCrew();
  const name = text(form, "name");
  const born = text(form, "date_of_birth");
  if (!name) return "Give them a name.";
  if (born && !isDay(born)) return "Pick their birthday, or leave it empty.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("dependents")
    .insert({ household_id: member.householdId, display_name: name, date_of_birth: born || null });
  if (error) return error.code === "42501" ? "Only Captains can add crew." : problem(error);
  revalidatePath("/", "layout");
  return null;
}
