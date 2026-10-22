// First Mate as an MCP server, for Claude: the Logbook (calendar), Duties
// (tasks), the Galley (recipes, and meals planned on the Logbook), Portraits
// (photos and albums), your own gym routines and, for Owners, reconciling the
// Ledger.
// Signs in as a person: with a token from OAuth (Claude's connector, see
// app/oauth) or their key from Exercise, as Authorization: Bearer fm_…
// The secret key skips row-level security, so every tool keeps to the key
// holder's household and checks what the policies would.
import { NextResponse } from "next/server";
import { REPEATS, type Repeat, nextDue } from "@/lib/duties";
import { DAY_SHORT, type RoutineExercise, exercisesFrom, weekdaysFrom } from "@/lib/exercise";
import { findRecipes, ingredientLine, parseTags, type RecipeCard } from "@/lib/galley";
import { hashKey } from "@/lib/health";
import { type EventRow, type ExceptionRow, WEEKDAYS, addDays, dayKey, describeRepeat, fromWall, occurrences, startOfDay, wallOf } from "@/lib/logbook";
import { Problem, type Tool, answer } from "@/lib/mcp";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;
type Ctx = { db: Admin; me: string; household: string; owner: boolean; origin: string };

const INSTRUCTIONS =
  "First Mate is the family's organiser. Dates are YYYY-MM-DD and times HH:MM, both in Sydney. " +
  "The Logbook is the calendar; Duties are the to-do list; the Galley is the cookbook. " +
  "To plan meals, find recipes with list_recipes (get_recipes has ingredients and steps), then put each meal on the Logbook with add_event and its recipe_id. " +
  "Portraits holds the family's photos: find_photos describes them (date, caption, who's in them, tags, albums) without the pictures themselves; tag_photos and the album tools sort them. " +
  "Routines are the signed-in person's own gym workouts, opened on their phone at the gym and logged there. " +
  "For the weekly progression, read get_routines (its recent_logs show what was actually done), then update_routine. " +
  "The Ledger is the household's money, for Owners only. To reconcile, read list_unreconciled (past_choices show how merchants were categorised before), " +
  "then suggest_categories; an Owner confirms on the Ledger's Reconcile page.";

// ---------- arguments ----------

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(args: Record<string, unknown>, key: string, max = 2000): string | null {
  const v = args[key];
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw new Problem(`${key} should be text.`);
  if (v.trim().length > max) throw new Problem(`${key} is too long (${max} characters at most).`);
  return v.trim() || null;
}
const matching = (args: Record<string, unknown>, key: string, re: RegExp, what: string) => {
  const v = str(args, key);
  if (v !== null && !re.test(v)) throw new Problem(`${key} should be ${what}.`);
  return v;
};
const day = (args: Record<string, unknown>, key: string) => matching(args, key, DAY, "a date, YYYY-MM-DD");
const time = (args: Record<string, unknown>, key: string) => matching(args, key, TIME, "a time, HH:MM");
const id = (args: Record<string, unknown>, key: string) => {
  const v = matching(args, key, UUID, "an id from a list_ tool");
  if (!v) throw new Problem(`Say which ${key}.`);
  return v;
};

/** Rows from a query, or a thrown error (logged, not shown to the model). */
function rows<T>({ data, error }: { data: unknown; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (d: Date) => {
  const w = wallOf(d);
  return `${pad(w.h)}:${pad(w.min)}`;
};
const at = (date: string, t: string) => {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = t.split(":").map(Number);
  return fromWall({ y, m, d, h, min });
};

// ---------- the crew, by name ----------

async function crew({ db, household }: Ctx) {
  const [people, kids] = await Promise.all([
    db.from("household_members").select("profile_id, profiles(display_name)").eq("household_id", household),
    db.from("dependents").select("id, display_name").eq("household_id", household),
  ]);
  return [
    ...rows<{ profile_id: string; profiles: { display_name: string } | null }[]>(people).map((p) => ({ key: `p:${p.profile_id}`, name: p.profiles?.display_name ?? "Crew" })),
    ...rows<{ id: string; display_name: string }[]>(kids).map((k) => ({ key: `d:${k.id}`, name: k.display_name })),
  ];
}

/** Crew keys ("p:…"/"d:…") for names, or a Problem listing who there is. */
function keysFor(names: unknown, everyone: { key: string; name: string }[]): string[] {
  if (names === undefined || names === null) return [];
  const list = Array.isArray(names) ? names : [names];
  return list.map((n) => {
    const found = everyone.find((c) => c.name.toLowerCase() === String(n).trim().toLowerCase());
    if (!found) throw new Problem(`No one called ${n}. The crew: ${everyone.map((c) => c.name).join(", ")}.`);
    return found.key;
  });
}

const canDelete = (ctx: Ctx, createdBy: string) => ctx.owner || createdBy === ctx.me;

function ledgerOwner(ctx: Ctx) {
  if (!ctx.owner) throw new Problem("The Ledger is for the household's Owners only.");
}

// ---------- Portraits ----------

/** The photo ids given that are in this household, or a Problem naming the first that isn't. */
async function ourPhotos(ctx: Ctx, given: unknown): Promise<string[]> {
  const list = given === undefined || given === null ? [] : Array.isArray(given) ? given.map(String) : [String(given)];
  if (list.some((p) => !UUID.test(p))) throw new Problem("photo_ids should be ids from find_photos.");
  if (list.length > 500) throw new Problem("500 photos at a time, at most.");
  if (list.length === 0) return [];
  const found = new Set(rows<{ id: string }[]>(await ctx.db.from("portrait_photos").select("id").eq("household_id", ctx.household).in("id", list)).map((r) => r.id));
  const missing = list.find((p) => !found.has(p));
  if (missing) throw new Problem(`No photo ${missing} in Portraits. find_photos has them.`);
  return [...found];
}

async function fileIn(ctx: Ctx, albumId: string, photoIds: string[]) {
  if (photoIds.length === 0) return;
  const links = photoIds.map((photo_id) => ({ album_id: albumId, photo_id, household_id: ctx.household }));
  const { error } = await ctx.db.from("portrait_album_photos").upsert(links, { onConflict: "album_id,photo_id", ignoreDuplicates: true });
  if (error) throw error;
}

// ---------- routines: always the signed-in person's own (exercise is private) ----------

const ROUTINE = "id, name, category, description, warm_up, progression, link, rest_seconds, weekdays";
const EXERCISES = "routine_exercises(position, name, sets, reps, rep_unit, load, cue)";
type RoutineRow = {
  id: string; name: string; category: string | null; description: string | null; warm_up: string | null; progression: string | null;
  link: string | null; rest_seconds: number | null; weekdays: string[];
  routine_exercises: (RoutineExercise & { position: number })[];
};

const days = (weekdays: string[]) => WEEKDAYS.filter((d) => weekdays.includes(d)).map((d) => DAY_SHORT[d]);

async function myRoutine(ctx: Ctx, routineId: string) {
  const { data, error } = await ctx.db.from("routines").select(`${ROUTINE}, ${EXERCISES}`).eq("id", routineId).eq("household_id", ctx.household).eq("profile_id", ctx.me).maybeSingle();
  if (error) throw error;
  if (!data) throw new Problem("No routine of yours with that id. list_routines has them.");
  return data as RoutineRow;
}

/** A routine from the arguments; for an update, anything left out stays as it was. */
function routineFrom(args: Record<string, unknown>, was?: RoutineRow) {
  const given = (key: string) => key in args;
  const name = given("name") || !was ? str(args, "name", 60) : was.name;
  if (!name) throw new Problem("Give the routine a name.");
  const link = given("link") || !was ? str(args, "link", 500) : was.link;
  if (link && !/^https?:\/\/\S+$/.test(link)) throw new Problem("link should be a web address, starting https://");
  let rest = was?.rest_seconds ?? null;
  if (given("rest_seconds")) {
    rest = args.rest_seconds === null ? null : Number(args.rest_seconds);
    if (rest !== null && !(Number.isInteger(rest) && rest >= 0 && rest <= 600)) throw new Problem("rest_seconds should be a whole number, 0 to 600.");
  }
  const weekdays = given("days") ? weekdaysFrom(args.days ?? []) : (was?.weekdays ?? []);
  if (typeof weekdays === "string") throw new Problem(weekdays);
  const exercises = given("exercises") || !was ? exercisesFrom(args.exercises) : was.routine_exercises.sort((a, b) => a.position - b.position);
  if (typeof exercises === "string") throw new Problem(exercises);
  const kept = (key: "category" | "description" | "warm_up" | "progression", max: number) => (given(key) || !was ? str(args, key, max) : was[key]);
  return {
    p_name: name, p_category: kept("category", 40), p_description: kept("description", 2000), p_warm_up: kept("warm_up", 2000),
    p_progression: kept("progression", 2000), p_link: link, p_rest_seconds: rest, p_weekdays: weekdays,
    p_exercises: exercises.map(({ name, sets, reps, rep_unit, load, cue }) => ({ name, sets, reps, rep_unit, load, cue })),
  };
}

async function saveRoutine(ctx: Ctx, routineId: string | null, fields: ReturnType<typeof routineFrom>) {
  const { data, error } = await ctx.db.rpc("exercise_save_routine", { p_routine: routineId, p_household: ctx.household, p_profile: ctx.me, ...fields });
  if (error) throw error;
  return data as string;
}

const routineFields = {
  name: { type: "string" },
  category: { type: "string", description: "A short group, like Golf or Legs." },
  description: { type: "string" },
  days: { type: "array", items: { type: "string", enum: Object.values(DAY_SHORT) }, description: "Which days it's done, like [\"Mon\", \"Wed\", \"Fri\"]. It shows under Today on those days." },
  rest_seconds: { type: "integer", description: "Rest between sets." },
  warm_up: { type: "string" },
  progression: { type: "string", description: "How it steps up week to week." },
  link: { type: "string", description: "Where it came from, like a video to watch. https:// only." },
  exercises: {
    type: "array",
    description: "In order. On update_routine this replaces the whole list: send every exercise back, with your changes.",
    items: {
      type: "object",
      properties: {
        order: { type: "integer" },
        name: { type: "string" },
        sets: { type: "integer" },
        reps: { type: "integer", description: "Per set: reps, or seconds held when rep_unit is seconds." },
        rep_unit: { type: "string", enum: ["reps", "per_side", "seconds"], description: "reps (in all), per_side (each side), or seconds. Defaults to reps." },
        load: { type: "string", description: "Free text, like \"5-8 kg DB\" or \"Bodyweight\"." },
        cue: { type: "string", description: "A coaching cue." },
      },
      required: ["name", "sets", "reps"],
    },
  },
};

// ---------- tools ----------

const whoField = { type: "array", items: { type: "string" }, description: "Crew members' names (people or children)." };

const TOOLS: Record<string, Tool<Ctx>> = {
  list_events: {
    description: "What's on the Logbook (the family calendar) between two dates, repeats included. Meals show their recipe_id.",
    input: {
      type: "object",
      properties: {
        from: { type: "string", description: "First day, YYYY-MM-DD." },
        to: { type: "string", description: "Last day, YYYY-MM-DD (inclusive). Defaults to a week after from." },
      },
      required: ["from"],
    },
    run: async (args, ctx) => {
      const first = day(args, "from");
      if (!first) throw new Problem("Say which day to start from.");
      const last = day(args, "to") ?? addDays(first, 6);
      if (last < first || last > addDays(first, 366)) throw new Problem("to should be on or after from, and within a year of it.");
      const from = startOfDay(first);
      const to = startOfDay(addDays(last, 1));
      const events = rows<(EventRow & { created_by: string; recipe_id: string | null })[]>(
        await ctx.db
          .from("events")
          .select("id, title, description, location, start_at, end_at, all_day, recurrence_rule, recurrence_ends_at, created_by, recipe_id")
          .eq("household_id", ctx.household)
          .lt("start_at", to.toISOString())
          .or(`recurrence_rule.not.is.null,end_at.gt.${from.toISOString()}`)
          .or(`recurrence_ends_at.is.null,recurrence_ends_at.gt.${from.toISOString()}`),
      );
      if (events.length === 0) return [];
      const ids = events.map((e) => e.id);
      const [exceptions, assignees, everyone] = await Promise.all([
        ctx.db.from("event_exceptions").select("parent_event_id, original_start_at, is_cancelled, title, description, location, start_at, end_at").in("parent_event_id", ids),
        ctx.db.from("event_assignees").select("event_id, profile_id, dependent_id").in("event_id", ids),
        crew(ctx),
      ]);
      const names = new Map(everyone.map((c) => [c.key, c.name]));
      const who = new Map<string, string[]>();
      for (const a of rows<{ event_id: string; profile_id: string | null; dependent_id: string | null }[]>(assignees)) {
        const name = names.get(a.profile_id ? `p:${a.profile_id}` : `d:${a.dependent_id}`);
        if (name) who.set(a.event_id, [...(who.get(a.event_id) ?? []), name]);
      }
      const byId = new Map(events.map((e) => [e.id, e]));
      return occurrences(events, rows<ExceptionRow[]>(exceptions), from, to).map((o) => ({
        event_id: o.eventId,
        ...(o.rule ? { occurrence: o.originalStart.toISOString(), repeats: describeRepeat(o.rule) } : {}),
        title: o.title,
        date: dayKey(o.start),
        ...(o.allDay
          ? { all_day: true, end_date: addDays(dayKey(o.end), -1) }
          : { start_time: hhmm(o.start), end_time: hhmm(o.end) }),
        location: o.location,
        description: o.description,
        who: who.get(o.eventId) ?? [],
        recipe_id: byId.get(o.eventId)?.recipe_id ?? null,
      }));
    },
  },

  add_event: {
    description:
      "Adds an event to the Logbook. Without start_time it's all day. With a recipe_id it's a meal: the title defaults to the recipe's, and the end to how long it takes.",
    input: {
      type: "object",
      properties: {
        title: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        start_time: { type: "string", description: "HH:MM. Leave out for an all-day event." },
        end_time: { type: "string", description: "HH:MM. Defaults to an hour after start_time (or the recipe's time)." },
        end_date: { type: "string", description: "Last day of a multi-day, all-day event." },
        location: { type: "string" },
        description: { type: "string" },
        who: whoField,
        recipe_id: { type: "string", description: "A Galley recipe, to make this a meal." },
      },
      required: ["date"],
    },
    run: async (args, ctx) => {
      const date = day(args, "date");
      if (!date) throw new Problem("Pick a date.");
      const recipeId = args.recipe_id ? id(args, "recipe_id") : null;
      let title = str(args, "title", 200);
      let length = 60;
      if (recipeId) {
        const { data: recipe } = await ctx.db.from("recipes").select("title, prep_minutes, cook_minutes").eq("id", recipeId).eq("household_id", ctx.household).maybeSingle();
        if (!recipe) throw new Problem("No recipe with that id in the Galley.");
        title ??= recipe.title as string;
        length = Math.max(30, (recipe.prep_minutes ?? 0) + (recipe.cook_minutes ?? 0) || 60);
      }
      if (!title) throw new Problem("Give the event a title.");
      const startTime = time(args, "start_time");
      const endTime = time(args, "end_time");
      let start: Date;
      let end: Date;
      if (startTime) {
        start = at(date, startTime);
        // Not past midnight unless an end time says so.
        end = endTime ? at(date, endTime) : new Date(Math.min(start.getTime() + length * 60_000, startOfDay(addDays(date, 1)).getTime()));
        if (end <= start) throw new Problem("It needs to end after it starts.");
      } else {
        const lastDay = day(args, "end_date") ?? date;
        if (lastDay < date) throw new Problem("end_date can't be before date.");
        start = startOfDay(date);
        end = startOfDay(addDays(lastDay, 1));
      }
      const who = keysFor(args.who, await crew(ctx));
      const { data: event, error } = await ctx.db
        .from("events")
        .insert({
          household_id: ctx.household,
          title,
          description: str(args, "description"),
          location: str(args, "location", 200),
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          all_day: !startTime,
          created_by: ctx.me,
          recipe_id: recipeId,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (who.length) {
        const { error: whoError } = await ctx.db.from("event_assignees").insert(
          [...new Set(who)].map((k) => ({ event_id: event.id, profile_id: k.startsWith("p:") ? k.slice(2) : null, dependent_id: k.startsWith("d:") ? k.slice(2) : null })),
        );
        if (whoError) {
          await ctx.db.from("events").delete().eq("id", event.id);
          throw whoError;
        }
      }
      return { added: event.id, title, date };
    },
  },

  delete_event: {
    description: "Deletes a Logbook event. For a repeating one, give occurrence (from list_events) to cancel just that one; leave it out to delete the whole series.",
    input: {
      type: "object",
      properties: { event_id: { type: "string" }, occurrence: { type: "string", description: "The occurrence value from list_events." } },
      required: ["event_id"],
    },
    run: async (args, ctx) => {
      const eventId = id(args, "event_id");
      const { data: event } = await ctx.db.from("events").select("title, created_by, recurrence_rule").eq("id", eventId).eq("household_id", ctx.household).maybeSingle();
      if (!event) throw new Problem("No event with that id on the Logbook.");
      if (!canDelete(ctx, event.created_by)) throw new Problem("Only the person who added this (or a Captain) can delete it.");
      const occurrence = str(args, "occurrence");
      if (occurrence && event.recurrence_rule) {
        if (Number.isNaN(Date.parse(occurrence))) throw new Problem("occurrence should be the value list_events gave.");
        const { error } = await ctx.db
          .from("event_exceptions")
          .upsert({ parent_event_id: eventId, original_start_at: new Date(occurrence).toISOString(), is_cancelled: true }, { onConflict: "parent_event_id,original_start_at" });
        if (error) throw error;
        return `Cancelled one ${event.title}; the rest still repeat.`;
      }
      const { error } = await ctx.db.from("events").delete().eq("id", eventId);
      if (error) throw error;
      return `Deleted ${event.title}.`;
    },
  },

  list_tasks: {
    description: "The family's Duties (to-do list): everything still to do, and optionally what was ticked off in the last fortnight.",
    input: { type: "object", properties: { include_done: { type: "boolean" } } },
    run: async (args, ctx) => {
      const columns = "id, title, notes, category, due_on, repeat, important, assigned_profile, assigned_dependent, done_at";
      const open = ctx.db.from("duties").select(columns).eq("household_id", ctx.household).is("done_at", null).order("due_on", { nullsFirst: false });
      const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
      const [todo, done, everyone] = await Promise.all([
        open,
        args.include_done ? ctx.db.from("duties").select(columns).eq("household_id", ctx.household).gte("done_at", since).order("done_at", { ascending: false }) : { data: [], error: null },
        crew(ctx),
      ]);
      const names = new Map(everyone.map((c) => [c.key, c.name]));
      type Row = { id: string; assigned_profile: string | null; assigned_dependent: string | null; [k: string]: unknown };
      return [...rows<Row[]>(todo), ...rows<Row[]>(done)].map(({ assigned_profile, assigned_dependent, ...d }) => ({
        ...d,
        who: assigned_profile ? names.get(`p:${assigned_profile}`) : assigned_dependent ? names.get(`d:${assigned_dependent}`) : null,
      }));
    },
  },

  add_task: {
    description: "Adds a duty to the family's to-do list.",
    input: {
      type: "object",
      properties: {
        title: { type: "string" },
        notes: { type: "string" },
        category: { type: "string", description: "A short group name, like Garden or School." },
        due_on: { type: "string", description: "YYYY-MM-DD" },
        repeat: { type: "string", enum: Object.keys(REPEATS), description: "Needs due_on. Ticking it off moves it to the next date." },
        important: { type: "boolean" },
        who: { type: "string", description: "A crew member's name." },
      },
      required: ["title"],
    },
    run: async (args, ctx) => {
      const title = str(args, "title", 200);
      if (!title) throw new Problem("Say what needs doing.");
      const due = day(args, "due_on");
      const repeat = str(args, "repeat");
      if (repeat && !(repeat in REPEATS)) throw new Problem(`repeat should be one of ${Object.keys(REPEATS).join(", ")}.`);
      if (repeat && !due) throw new Problem("A repeating duty needs a due_on to start from.");
      const [who] = keysFor(args.who, await crew(ctx));
      const { data, error } = await ctx.db
        .from("duties")
        .insert({
          household_id: ctx.household,
          created_by: ctx.me,
          title,
          notes: str(args, "notes"),
          category: str(args, "category", 40),
          due_on: due,
          repeat,
          important: args.important === true,
          assigned_profile: who?.startsWith("p:") ? who.slice(2) : null,
          assigned_dependent: who?.startsWith("d:") ? who.slice(2) : null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return { added: data.id, title };
    },
  },

  complete_task: {
    description: "Ticks a duty off (or back on with undo). A repeating one moves to its next date instead.",
    input: { type: "object", properties: { task_id: { type: "string" }, undo: { type: "boolean" } }, required: ["task_id"] },
    run: async (args, ctx) => {
      const taskId = id(args, "task_id");
      const { data: duty } = await ctx.db.from("duties").select("title, due_on, repeat").eq("id", taskId).eq("household_id", ctx.household).maybeSingle();
      if (!duty) throw new Problem("No duty with that id.");
      const change =
        args.undo === true
          ? { done_at: null, done_by: null }
          : duty.repeat && duty.due_on
            ? { due_on: nextDue(duty.due_on, duty.repeat as Repeat, dayKey(new Date())) }
            : { done_at: new Date().toISOString(), done_by: ctx.me };
      const { error } = await ctx.db.from("duties").update(change).eq("id", taskId);
      if (error) throw error;
      return args.undo === true ? `${duty.title} is back on the list.` : "due_on" in change ? `Done; ${duty.title} is next due ${change.due_on}.` : `Ticked off ${duty.title}.`;
    },
  },

  delete_task: {
    description: "Deletes a duty for good (to finish one, use complete_task).",
    input: { type: "object", properties: { task_id: { type: "string" } }, required: ["task_id"] },
    run: async (args, ctx) => {
      const taskId = id(args, "task_id");
      const { data: duty } = await ctx.db.from("duties").select("title, created_by").eq("id", taskId).eq("household_id", ctx.household).maybeSingle();
      if (!duty) throw new Problem("No duty with that id.");
      if (!canDelete(ctx, duty.created_by)) throw new Problem("Only a Captain, or whoever added it, can delete this.");
      const { error } = await ctx.db.from("duties").delete().eq("id", taskId);
      if (error) throw error;
      return `Deleted ${duty.title}.`;
    },
  },

  list_recipes: {
    description: "The Galley's recipes, optionally filtered. search matches titles, descriptions and ingredients (every word must match). Shows when each was last cooked.",
    input: { type: "object", properties: { search: { type: "string" }, tag: { type: "string" } } },
    run: async (args, ctx) => {
      type Row = Omit<RecipeCard, "tags" | "ingredients" | "collections" | "cooked_at" | "photo"> & {
        recipe_tags: { tag: string }[];
        recipe_ingredients: { name: string }[];
        recipe_cooks: { cooked_at: string }[];
      };
      const found = rows<Row[]>(
        await ctx.db
          .from("recipes")
          .select("id, title, description, servings, prep_minutes, cook_minutes, created_at, recipe_tags(tag), recipe_ingredients(name), recipe_cooks(cooked_at)")
          .eq("household_id", ctx.household)
          .order("cooked_at", { referencedTable: "recipe_cooks", ascending: false })
          .limit(1, { referencedTable: "recipe_cooks" }),
      ).map(({ recipe_tags, recipe_ingredients, recipe_cooks, ...r }) => ({
        ...r,
        tags: recipe_tags.map((t) => t.tag),
        ingredients: recipe_ingredients.map((i) => i.name),
        collections: [],
        cooked_at: recipe_cooks[0]?.cooked_at ?? null,
        photo: null,
      }));
      const tag = str(args, "tag")?.toLowerCase() ?? null;
      return findRecipes(found, { q: str(args, "search") ?? "", tag, sort: "az" }).map((r) => ({
        id: r.id,
        title: r.title,
        tags: r.tags,
        servings: r.servings,
        minutes: (r.prep_minutes ?? 0) + (r.cook_minutes ?? 0) || null,
        last_cooked: r.cooked_at ? dayKey(new Date(r.cooked_at)) : null,
      }));
    },
  },

  get_recipes: {
    description: "Recipes in full: ingredients (for shopping lists) and method.",
    input: { type: "object", properties: { ids: { type: "array", items: { type: "string" }, maxItems: 30 } }, required: ["ids"] },
    run: async (args, ctx) => {
      const ids = Array.isArray(args.ids) ? args.ids.map(String).filter((s) => UUID.test(s)).slice(0, 30) : [];
      if (!ids.length) throw new Problem("Give recipe ids from list_recipes.");
      type Row = {
        id: string; title: string; description: string | null; source_url: string | null; servings: number | null; prep_minutes: number | null; cook_minutes: number | null;
        recipe_ingredients: { position: number; quantity: number | null; unit: string | null; name: string; notes: string | null }[];
        recipe_steps: { position: number; instruction: string }[];
        recipe_tags: { tag: string }[];
      };
      const found = rows<Row[]>(
        await ctx.db
          .from("recipes")
          .select("id, title, description, source_url, servings, prep_minutes, cook_minutes, recipe_ingredients(position, quantity, unit, name, notes), recipe_steps(position, instruction), recipe_tags(tag)")
          .eq("household_id", ctx.household)
          .in("id", ids),
      );
      const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;
      return found.map(({ recipe_ingredients, recipe_steps, recipe_tags, ...r }) => ({
        ...r,
        tags: recipe_tags.map((t) => t.tag),
        ingredients: recipe_ingredients.sort(byPosition).map(ingredientLine),
        method: recipe_steps.sort(byPosition).map((s) => s.instruction),
      }));
    },
  },

  list_albums: {
    description: "Portraits' photo albums, newest first, with how many photos each has.",
    input: { type: "object", properties: {} },
    run: async (_, ctx) => {
      type Row = { id: string; title: string; taken_on: string | null; description: string | null; portrait_album_photos: { count: number }[] };
      const found = rows<Row[]>(
        await ctx.db
          .from("portrait_albums")
          .select("id, title, taken_on, description, portrait_album_photos(count)")
          .eq("household_id", ctx.household)
          .order("taken_on", { ascending: false, nullsFirst: false }),
      );
      return found.map(({ portrait_album_photos, ...a }) => ({ ...a, photos: portrait_album_photos[0]?.count ?? 0, link: `${ctx.origin}/portraits/${a.id}` }));
    },
  },

  find_photos: {
    description:
      "Finds photos in Portraits, newest first: by who's in them, a tag, an album, or when they were taken. Returns each one's date, caption, people, tags, albums and a link to open it; not the picture itself.",
    input: {
      type: "object",
      properties: {
        person: { type: "string", description: "A crew member's or child's name." },
        tag: { type: "string" },
        album_id: { type: "string", description: "From list_albums." },
        from: { type: "string", description: "Taken on or after, YYYY-MM-DD." },
        to: { type: "string", description: "Taken on or before, YYYY-MM-DD." },
        limit: { type: "integer", description: "At most this many (default 50, up to 200)." },
      },
    },
    run: async (args, ctx) => {
      const everyone = await crew(ctx);
      const sets: string[][] = [];
      if (args.person) {
        const [key] = keysFor(args.person, everyone);
        const col = key.startsWith("p:") ? "profile_id" : "dependent_id";
        sets.push(rows<{ photo_id: string }[]>(await ctx.db.from("portrait_tags").select("photo_id").eq("household_id", ctx.household).eq(col, key.slice(2))).map((r) => r.photo_id));
      }
      const tag = str(args, "tag", 40)?.toLowerCase();
      if (tag) sets.push(rows<{ photo_id: string }[]>(await ctx.db.from("portrait_tags").select("photo_id").eq("household_id", ctx.household).eq("word", tag)).map((r) => r.photo_id));
      if (args.album_id) {
        const albumId = id(args, "album_id");
        sets.push(rows<{ photo_id: string }[]>(await ctx.db.from("portrait_album_photos").select("photo_id").eq("household_id", ctx.household).eq("album_id", albumId)).map((r) => r.photo_id));
      }
      const limit = Math.min(200, Math.max(1, Number(args.limit) || 50));
      let q = ctx.db
        .from("portrait_photos")
        .select("id, taken_on, caption, portrait_tags(profile_id, dependent_id, word), portrait_album_photos(portrait_albums(title))")
        .eq("household_id", ctx.household);
      if (sets.length) {
        const ids = sets.reduce((a, b) => a.filter((x) => b.includes(x)));
        if (ids.length === 0) return [];
        // ponytail: ids go in the address; fine for a family's tags, a join view if one tag covers thousands.
        q = q.in("id", ids.slice(0, 1000));
      }
      const from = day(args, "from");
      const to = day(args, "to");
      if (from) q = q.gte("taken_on", from);
      if (to) q = q.lte("taken_on", to);
      type Row = {
        id: string; taken_on: string; caption: string | null;
        portrait_tags: { profile_id: string | null; dependent_id: string | null; word: string | null }[];
        portrait_album_photos: { portrait_albums: { title: string } | null }[];
      };
      const names = new Map(everyone.map((c) => [c.key, c.name]));
      return rows<Row[]>(await q.order("taken_on", { ascending: false }).order("created_at", { ascending: false }).limit(limit)).map((p) => ({
        id: p.id,
        taken_on: p.taken_on,
        caption: p.caption,
        people: p.portrait_tags.filter((t) => !t.word).map((t) => names.get(t.profile_id ? `p:${t.profile_id}` : `d:${t.dependent_id}`) ?? "someone"),
        tags: p.portrait_tags.flatMap((t) => t.word ?? []),
        albums: p.portrait_album_photos.flatMap((a) => a.portrait_albums?.title ?? []),
        link: `${ctx.origin}/portraits/photo/${p.id}`,
      }));
    },
  },

  create_album: {
    description: "Starts a Portraits album, optionally with photos already in it (photo_ids from find_photos).",
    input: {
      type: "object",
      properties: {
        title: { type: "string" },
        taken_on: { type: "string", description: "YYYY-MM-DD, when it's from." },
        description: { type: "string" },
        photo_ids: { type: "array", items: { type: "string" } },
      },
      required: ["title"],
    },
    run: async (args, ctx) => {
      const title = str(args, "title", 200);
      if (!title) throw new Problem("Give the album a name.");
      const photos = await ourPhotos(ctx, args.photo_ids);
      const { data: album, error } = await ctx.db
        .from("portrait_albums")
        .insert({ household_id: ctx.household, title, taken_on: day(args, "taken_on"), description: str(args, "description", 5000), created_by: ctx.me })
        .select("id")
        .single();
      if (error) throw error;
      await fileIn(ctx, album.id, photos);
      return { added: album.id, title, photos: photos.length, link: `${ctx.origin}/portraits/${album.id}` };
    },
  },

  add_to_album: {
    description: "Puts photos (photo_ids from find_photos) into a Portraits album. They stay in any other albums too.",
    input: { type: "object", properties: { album_id: { type: "string" }, photo_ids: { type: "array", items: { type: "string" } } }, required: ["album_id", "photo_ids"] },
    run: async (args, ctx) => {
      const albumId = id(args, "album_id");
      const { data: album } = await ctx.db.from("portrait_albums").select("title").eq("id", albumId).eq("household_id", ctx.household).maybeSingle();
      if (!album) throw new Problem("No album with that id. list_albums has them.");
      const photos = await ourPhotos(ctx, args.photo_ids);
      if (photos.length === 0) throw new Problem("Give some photo_ids from find_photos.");
      await fileIn(ctx, albumId, photos);
      return { album: album.title, added: photos.length };
    },
  },

  tag_photos: {
    description: "Tags photos (photo_ids from find_photos) with who's in them and with words. Adds to their tags; nothing is taken away. caption sets the caption, for one photo at a time.",
    input: {
      type: "object",
      properties: { photo_ids: { type: "array", items: { type: "string" } }, people: whoField, tags: { type: "array", items: { type: "string" } }, caption: { type: "string" } },
      required: ["photo_ids"],
    },
    run: async (args, ctx) => {
      const photos = await ourPhotos(ctx, args.photo_ids);
      if (photos.length === 0) throw new Problem("Give some photo_ids from find_photos.");
      const people = [...new Set(keysFor(args.people, await crew(ctx)))];
      const words = parseTags((Array.isArray(args.tags) ? args.tags : args.tags ? [args.tags] : []).join(","));
      if (words.some((w) => w.length > 40)) throw new Problem("Keep each tag under 40 letters.");
      const caption = str(args, "caption", 2000);
      if (caption && photos.length > 1) throw new Problem("A caption is for one photo at a time.");
      const tags = photos.flatMap((photo_id) => [
        ...people.map((k) => ({ profile_id: k.startsWith("p:") ? k.slice(2) : null, dependent_id: k.startsWith("d:") ? k.slice(2) : null, word: null, photo_id, household_id: ctx.household })),
        ...words.map((word) => ({ profile_id: null, dependent_id: null, word, photo_id, household_id: ctx.household })),
      ]);
      if (tags.length) {
        const { error } = await ctx.db.from("portrait_tags").upsert(tags, { onConflict: "photo_id,profile_id,dependent_id,word", ignoreDuplicates: true });
        if (error) throw error;
      }
      if (caption) {
        const { error } = await ctx.db.from("portrait_photos").update({ caption }).eq("id", photos[0]);
        if (error) throw error;
      }
      return { tagged: photos.length, people: people.length, tags: words, ...(caption ? { caption } : {}) };
    },
  },

  list_routines: {
    description: "Your gym routines (private to you): name, category, days and when each was last done. search matches name and category.",
    input: { type: "object", properties: { search: { type: "string" } } },
    run: async (args, ctx) => {
      type Row = { id: string; name: string; category: string | null; weekdays: string[]; routine_logs: { done_on: string }[] };
      const found = rows<Row[]>(
        await ctx.db
          .from("routines")
          .select("id, name, category, weekdays, routine_logs(done_on)")
          .eq("household_id", ctx.household)
          .eq("profile_id", ctx.me)
          .order("name")
          .order("done_on", { referencedTable: "routine_logs", ascending: false })
          .limit(1, { referencedTable: "routine_logs" }),
      );
      const words = (str(args, "search") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      return found
        .filter((r) => words.every((w) => `${r.name} ${r.category ?? ""}`.toLowerCase().includes(w)))
        .map((r) => ({ id: r.id, name: r.name, category: r.category, days: days(r.weekdays), last_done: r.routine_logs[0]?.done_on ?? null }));
    },
  },

  get_routines: {
    description: "Routines in full, with their exercises in order and the last five logs (what was actually done, set by set).",
    input: { type: "object", properties: { ids: { type: "array", items: { type: "string" }, maxItems: 30 } }, required: ["ids"] },
    run: async (args, ctx) => {
      const ids = Array.isArray(args.ids) ? args.ids.map(String).filter((s) => UUID.test(s)).slice(0, 30) : [];
      if (!ids.length) throw new Problem("Give routine ids from list_routines.");
      type Row = RoutineRow & { routine_logs: { done_on: string; notes: string | null; done: unknown }[] };
      const found = rows<Row[]>(
        await ctx.db
          .from("routines")
          .select(`${ROUTINE}, ${EXERCISES}, routine_logs(done_on, notes, done)`)
          .eq("household_id", ctx.household)
          .eq("profile_id", ctx.me)
          .in("id", ids)
          .order("done_on", { referencedTable: "routine_logs", ascending: false })
          .limit(5, { referencedTable: "routine_logs" }),
      );
      return found.map(({ weekdays, routine_exercises, routine_logs, ...r }) => ({
        ...r,
        days: days(weekdays),
        exercises: routine_exercises.sort((a, b) => a.position - b.position).map(({ position, ...e }) => ({ order: position, ...e })),
        recent_logs: routine_logs.map((l) => ({ date: l.done_on, notes: l.notes, done: l.done })),
      }));
    },
  },

  add_routine: {
    description: "Adds a gym routine for you: an ordered list of exercises with sets, reps and load.",
    input: { type: "object", properties: routineFields, required: ["name", "exercises"] },
    run: async (args, ctx) => {
      const fields = routineFrom(args);
      return { added: await saveRoutine(ctx, null, fields), name: fields.p_name };
    },
  },

  update_routine: {
    description: "Changes a routine: give only what changes. exercises replaces the whole list, so to change one exercise send them all back from get_routines.",
    input: { type: "object", properties: { routine_id: { type: "string" }, ...routineFields }, required: ["routine_id"] },
    run: async (args, ctx) => {
      const routineId = id(args, "routine_id");
      const fields = routineFrom(args, await myRoutine(ctx, routineId));
      await saveRoutine(ctx, routineId, fields);
      return `Saved ${fields.p_name}.`;
    },
  },

  delete_routine: {
    description: "Deletes a routine and its logs for good.",
    input: { type: "object", properties: { routine_id: { type: "string" } }, required: ["routine_id"] },
    run: async (args, ctx) => {
      const routine = await myRoutine(ctx, id(args, "routine_id"));
      const { error } = await ctx.db.from("routines").delete().eq("id", routine.id);
      if (error) throw error;
      return `Deleted ${routine.name}.`;
    },
  },

  log_routine: {
    description: "Logs a routine as done, as written (put anything different in notes). Usually it's logged in the app at the gym; this is for \"I did it yesterday\".",
    input: {
      type: "object",
      properties: { routine_id: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD. Defaults to today." }, notes: { type: "string" } },
      required: ["routine_id"],
    },
    run: async (args, ctx) => {
      const routine = await myRoutine(ctx, id(args, "routine_id"));
      const date = day(args, "date") ?? dayKey(new Date());
      if (date > dayKey(new Date())) throw new Problem("That's in the future; log it once it's done.");
      const { error } = await ctx.db.from("routine_logs").insert({
        routine_id: routine.id,
        household_id: ctx.household,
        profile_id: ctx.me,
        done_on: date,
        notes: str(args, "notes"),
        done: routine.routine_exercises
          .sort((a, b) => a.position - b.position)
          .map((e) => ({ name: e.name, rep_unit: e.rep_unit, reps: Array(e.sets).fill(e.reps), load: e.load })),
      });
      if (error) throw error;
      return `Logged ${routine.name} on ${date}.`;
    },
  },

  // ---------- the Ledger: Owners only, like the app ----------

  list_unreconciled: {
    description:
      "Ledger (Owners only): merchants whose imported transactions nobody has categorised, most transactions first, " +
      "with the household's categories and past_choices (how each merchant was categorised before) to go by. " +
      "total is negative for money out. Merchants the Ledger already remembers aren't listed. " +
      "A merchant you suggested earlier comes back with your_suggestion.",
    input: { type: "object", properties: { limit: { type: "number", description: "Merchants to list, up to 200 (default 100)." } } },
    run: async (args, ctx) => {
      ledgerOwner(ctx);
      const limit = Math.min(Math.max(Math.trunc(Number(args.limit) || 100), 1), 200);
      type Waiting = { merchant: string; transactions: number; total: number; first: string; last: string; example: string; suggestion: string | null };
      const [waiting, categories, payees] = await Promise.all([
        ctx.db
          .from("budget_pending")
          .select("merchant, transactions, total, first, last, example, suggestion")
          .eq("household_id", ctx.household)
          .or("suggested_by.is.null,suggested_by.eq.claude")
          .order("transactions", { ascending: false })
          .order("merchant")
          .limit(limit),
        ctx.db.from("budget_categories").select("id, name, type, parent_category_id, archived_at").eq("household_id", ctx.household).order("name"),
        ctx.db.from("budget_payees").select("merchant, category_id").eq("household_id", ctx.household).order("updated_at", { ascending: false }).limit(1000),
      ]);
      const all = rows<{ id: string; name: string; type: string; parent_category_id: string | null; archived_at: string | null }[]>(categories);
      const name = (id: string | null) => {
        if (!id || id === "transfer") return "transfer";
        const c = all.find((x) => x.id === id);
        const parent = all.find((x) => x.id === c?.parent_category_id);
        return parent ? `${parent.name} › ${c?.name}` : (c?.name ?? "?");
      };
      return {
        categories: all.filter((c) => !c.archived_at).map((c) => ({ id: c.id, name: name(c.id), type: c.type })),
        transfer: "Use category_id \"transfer\" for money moved to or from the household's own accounts.",
        past_choices: rows<{ merchant: string; category_id: string | null }[]>(payees).map((p) => ({ merchant: p.merchant, category: name(p.category_id) })),
        waiting: rows<Waiting[]>(waiting).map(({ suggestion, ...w }) => ({ ...w, ...(suggestion ? { your_suggestion: name(suggestion) } : {}) })),
      };
    },
  },

  suggest_categories: {
    description:
      "Ledger (Owners only): suggests a category for merchants from list_unreconciled. category_id is an id from its categories, " +
      "or \"transfer\" for money moved to or from the household's own accounts. Suggestions wait on the Ledger's Reconcile page " +
      "for an Owner to confirm, and only their confirmations are remembered. Leave out merchants you aren't sure of.",
    input: {
      type: "object",
      properties: {
        suggestions: {
          type: "array",
          maxItems: 200,
          items: { type: "object", properties: { merchant: { type: "string" }, category_id: { type: "string" } }, required: ["merchant", "category_id"] },
        },
      },
      required: ["suggestions"],
    },
    run: async (args, ctx) => {
      ledgerOwner(ctx);
      const given = Array.isArray(args.suggestions) ? args.suggestions : [];
      if (given.length === 0) throw new Problem("Give some suggestions, each a merchant and a category_id.");
      if (given.length > 200) throw new Problem("200 merchants at a time, at most.");
      const live = new Set(
        rows<{ id: string }[]>(await ctx.db.from("budget_categories").select("id").eq("household_id", ctx.household).is("archived_at", null)).map((c) => c.id),
      );
      // Check them all before changing anything, so a bad one doesn't leave half done.
      const checked = given.map((s: { merchant?: unknown; category_id?: unknown }) => {
        const merchant = typeof s?.merchant === "string" ? s.merchant.trim() : "";
        const category = String(s?.category_id ?? "");
        if (!merchant) throw new Problem("Each suggestion needs the merchant, as list_unreconciled gives it.");
        if (category !== "transfer" && !live.has(category)) {
          throw new Problem(`${merchant}: category_id should be an id from list_unreconciled's categories, or "transfer".`);
        }
        return { merchant, category: category === "transfer" ? null : category };
      });
      let transactions = 0;
      const notWaiting: string[] = [];
      // ponytail: one round trip per merchant; fine for 200, batch it if lists grow.
      for (const s of checked) {
        const n = rows<number>(await ctx.db.rpc("budget_suggest_for", { p_household: ctx.household, p_merchant: s.merchant, p_category: s.category }));
        transactions += n;
        if (n === 0) notWaiting.push(s.merchant);
      }
      return {
        suggested: checked.length - notWaiting.length,
        transactions,
        ...(notWaiting.length ? { not_waiting: notWaiting } : {}),
        next: "An Owner confirms these on the Ledger's Reconcile page.",
      };
    },
  },
};

// ---------- the endpoint ----------

const reply = (status: number, body: object) => NextResponse.json(body, { status });

export async function POST(request: Request) {
  // Without a token, point the app at First Mate's sign-in.
  const origin = new URL(request.url).origin;
  const signIn = { "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"` };
  const refuse = (error: string) => NextResponse.json({ error }, { status: 401, headers: signIn });
  const key = request.headers.get("authorization")?.match(/^Bearer\s+(fm_[\w-]{20,100})\s*$/i)?.[1];
  if (!key) return refuse("Sign in to First Mate first.");
  const db = createAdminClient();
  const [token, healthKey] = await Promise.all([
    db.from("mcp_tokens").select("profile_id, household_id").eq("token_hash", hashKey(key)).maybeSingle(),
    db.from("health_keys").select("profile_id, household_id").eq("key_hash", hashKey(key)).maybeSingle(),
  ]);
  const holder = token.data ?? healthKey.data;
  if (!holder) return refuse("That sign-in isn't in use any more. Connect again.");
  const { data: member } = await db
    .from("household_members")
    .select("role")
    .eq("household_id", holder.household_id)
    .eq("profile_id", holder.profile_id)
    .neq("role", "guest")
    .maybeSingle();
  if (!member) return reply(403, { error: "You're no longer in the crew." });
  const ctx: Ctx = { db, me: holder.profile_id, household: holder.household_id, owner: member.role === "owner", origin };

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply(400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "The body should be JSON." } });
  }
  const answers = (await Promise.all([body].flat().map((m) => answer(m as object, TOOLS, ctx, INSTRUCTIONS)))).filter(Boolean);
  if (answers.length === 0) return new Response(null, { status: 202 });
  return NextResponse.json(Array.isArray(body) ? answers : answers[0]);
}

// No server-to-client stream: everything is a reply to a POST.
export const GET = () => new Response(null, { status: 405, headers: { Allow: "POST" } });
