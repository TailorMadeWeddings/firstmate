// One-off: load a CookBook (cookbookmanager.com) YAML export into the Galley.
//   node --env-file=.env.local scripts/import-cookbook.ts "Recipes to import"          # dry run
//   node --env-file=.env.local scripts/import-cookbook.ts "Recipes to import" --write  # for real
// Recipes whose title is already in the Galley are skipped, so it's safe to run again.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PHOTO_BUCKET, isoMinutes, parseIngredients, parseSteps, parseTags } from "../lib/galley.ts";

type CookBookRecipe = {
  _file: string;
  name: string;
  description?: string;
  notes?: string;
  video?: string;
  servings?: string;
  source?: string;
  image?: string;
  prep_time?: string;
  cook_time?: string;
  tags?: string[];
  ingredients?: string[];
  directions?: string[];
};

const [folder, flag] = process.argv.slice(2);
if (!folder) throw new Error("Usage: import-cookbook.ts <export folder> [--write]");
const write = flag === "--write";

// ponytail: macOS's Ruby reads YAML, so no YAML package for a one-off.
const recipes: CookBookRecipe[] = JSON.parse(
  execFileSync("ruby", [
    "-EUTF-8:UTF-8", "-ryaml", "-rjson", "-rdate", "-e",
    'puts JSON.generate(Dir[File.join(ARGV[0], "*.yml")].sort.map { |f| YAML.safe_load(File.read(f), permitted_classes: [Date, Time]).merge("_file" => File.basename(f).force_encoding("UTF-8")) })',
    folder,
  ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }),
);

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
// ponytail: first household and its first Captain; v1 has just the one.
const { data: captain, error: who } = await db.from("household_members").select("household_id, profile_id").eq("role", "owner").limit(1).single();
if (who) throw who;
const { data: existing, error: seen } = await db.from("recipes").select("title").eq("household_id", captain.household_id);
if (seen) throw seen;
const already = new Set(existing.map((r) => r.title.trim().toLowerCase()));

function toRows(r: CookBookRecipe) {
  const notes = r.notes?.trim() && r.notes.trim() !== "Notes" ? r.notes.trim() : null;
  const servings = Number(r.servings?.match(/\d+/)?.[0]);
  return {
    recipe: {
      household_id: captain!.household_id,
      created_by: captain!.profile_id,
      title: r.name.trim(),
      // The Galley has no notes or video fields, so they go at the end of the description.
      description: [r.description?.trim(), notes && `Notes: ${notes}`, r.video && `Video: ${r.video}`].filter(Boolean).join("\n\n") || null,
      source_url: r.source && /^https?:\/\/\S+$/i.test(r.source) ? r.source : null,
      servings: servings >= 1 && servings <= 100 ? servings : null,
      prep_minutes: isoMinutes(r.prep_time),
      cook_minutes: isoMinutes(r.cook_time),
    },
    ingredients: parseIngredients((r.ingredients ?? []).join("\n")),
    steps: parseSteps((r.directions ?? []).join("\n")),
    tags: parseTags((r.tags ?? []).join(",")),
  };
}

async function addPhoto(recipeId: string, url: string): Promise<string | null> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const type = response.headers.get("content-type")?.split(/[;,]/)[0] ?? "";
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[type];
  if (!response.ok || !ext) return `photo: ${response.status} ${type}`;
  const body = await response.arrayBuffer();
  if (body.byteLength > 5 * 1024 * 1024) return "photo: over 5 MB";
  const path = `${recipeId}/${randomUUID()}.${ext}`;
  const { error } = await db.storage.from(PHOTO_BUCKET).upload(path, body, { contentType: type });
  if (error) return `photo: ${error.message}`;
  const { error: saved } = await db.from("recipes").update({ photo_path: path }).eq("id", recipeId);
  return saved ? `photo: ${saved.message}` : null;
}

let added = 0;
let skipped = 0;
const problems: string[] = [];
for (const r of recipes) {
  if (already.has(r.name.trim().toLowerCase())) {
    skipped++;
    continue;
  }
  const rows = toRows(r);
  if (!write) {
    console.log(`${rows.recipe.title} — ${rows.ingredients.length} ingredients, ${rows.steps.length} steps, serves ${rows.recipe.servings ?? "?"}, ${rows.recipe.prep_minutes ?? 0}+${rows.recipe.cook_minutes ?? 0} min, tags [${rows.tags}]${r.image ? ", photo" : ""}`);
    added++;
    continue;
  }
  const { data: recipe, error } = await db.from("recipes").insert(rows.recipe).select("id").single();
  if (error) {
    problems.push(`${r._file}: ${error.message}`);
    continue;
  }
  const id = recipe.id;
  const parts = await Promise.all([
    db.from("recipe_ingredients").insert(rows.ingredients.map((i, n) => ({ ...i, recipe_id: id, position: n + 1 }))),
    db.from("recipe_steps").insert(rows.steps.map((s, n) => ({ ...s, recipe_id: id, position: n + 1 }))),
    db.from("recipe_tags").insert(rows.tags.map((tag) => ({ recipe_id: id, tag }))),
  ]);
  const failed = parts.find((p) => p.error)?.error;
  if (failed) {
    // All or nothing per recipe: its ingredients, steps and tags go with it.
    await db.from("recipes").delete().eq("id", id);
    problems.push(`${r._file}: ${failed.message}`);
    continue;
  }
  if (r.image) {
    const photo = await addPhoto(id, r.image).catch((e: Error) => `photo: ${e.message}`);
    if (photo) problems.push(`${r._file}: ${photo}`);
  }
  added++;
  process.stdout.write(".");
}

console.log(`\n${write ? "Added" : "Would add"} ${added}, skipped ${skipped} already in the Galley.`);
if (problems.length) console.log(`Problems:\n  ${problems.join("\n  ")}`);
