"use server";

// Saving and deleting recipes and collections, through the signed-in user's
// own client: row-level security lets the crew add recipes, Captains change
// any, others their own, and contributors add to collections shared with them.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PHOTO_BUCKET, parseIngredients, parseSteps, parseTags } from "@/lib/galley";
import { currentMember } from "@/lib/players";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Result = string | null;

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const done = () => revalidatePath("/galley", "layout");

/** A whole number in range, null when blank, or undefined when it isn't one. */
function whole(form: FormData, key: string, max: number): number | null | undefined {
  const raw = text(form, key);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : undefined;
}

export async function saveRecipe(recipeId: string | null, _: Result, form: FormData): Promise<Result> {
  const member = await currentMember();
  const title = text(form, "title");
  const source = text(form, "source_url");
  const servings = whole(form, "servings", 100);
  const prep = whole(form, "prep_minutes", 10000);
  const cook = whole(form, "cook_minutes", 10000);
  if (!title) return "Give the recipe a name.";
  if (source && !/^https?:\/\/\S+$/i.test(source)) return "The source should be a web link starting with https://";
  if (servings === undefined || servings === 0) return "Servings should be a whole number, like 4.";
  if (prep === undefined || cook === undefined) return "Times are in whole minutes, like 20.";
  const ingredients = parseIngredients(text(form, "ingredients"));
  const steps = parseSteps(text(form, "steps"));

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("galley_save_recipe", {
    p_recipe: recipeId,
    p_household: member.householdId,
    p_title: title,
    p_description: text(form, "description") || null,
    p_source_url: source || null,
    p_servings: servings,
    p_prep_minutes: prep,
    p_cook_minutes: cook,
    p_ingredients: ingredients,
    p_steps: steps,
    p_tags: parseTags(text(form, "tags")),
    p_collection: recipeId ? null : text(form, "collection") || null,
  });
  if (error) {
    if (error.code === "P0020") return "Only a Captain, or whoever added this recipe, can change it.";
    if (error.code === "42501") return "You can add recipes only to a collection shared with you to add to.";
    console.error(error);
    return "Couldn't save the recipe. Try again.";
  }
  done();
  redirect(`/galley/${id}`);
}

export async function deleteRecipe(recipeId: string): Promise<Result> {
  await currentMember();
  const supabase = await createClient();
  const { data, error } = await supabase.from("recipes").delete().eq("id", recipeId).select("photo_path").single();
  if (error) {
    return error.code === "PGRST116" ? "Only a Captain, or whoever added this recipe, can delete it." : "Couldn't delete it. Try again.";
  }
  // The photo's permissions went with the recipe, so tidy it up with the admin client.
  if (data.photo_path) await createAdminClient().storage.from(PHOTO_BUCKET).remove([data.photo_path]);
  done();
  redirect("/galley");
}

// ---------- photos ----------
// The browser shrinks the photo and uploads it straight to storage (as the
// user, so storage's own policies apply); this records which one is current.

export async function setRecipePhoto(recipeId: string, path: string | null): Promise<Result> {
  await currentMember();
  if (path !== null && !path.startsWith(`${recipeId}/`)) return "That photo belongs to another recipe.";
  const supabase = await createClient();
  const { data: before } = await supabase.from("recipes").select("photo_path").eq("id", recipeId).maybeSingle();
  const { error } = await supabase.from("recipes").update({ photo_path: path }).eq("id", recipeId).select("id").single();
  if (error) return "Only a Captain, or whoever added this recipe, can change its photo.";
  if (before?.photo_path && before.photo_path !== path) await supabase.storage.from(PHOTO_BUCKET).remove([before.photo_path]);
  done();
  return null;
}

// ---------- cooking ----------

/** Cooking mode's Done: note it was cooked (for "recently cooked") and go back to the recipe. */
export async function markCooked(recipeId: string): Promise<void> {
  await currentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("recipe_cooks").insert({ recipe_id: recipeId });
  if (error) console.error(error);
  done();
  redirect(`/galley/${recipeId}`);
}

// ---------- collections (Captains curate and share them) ----------

const OWNERS_ONLY = "Only a Captain can change collections.";

export async function createCollection(_: Result, form: FormData): Promise<Result> {
  const member = await currentMember();
  if (member.role !== "owner") return OWNERS_ONLY;
  const name = text(form, "name");
  if (!name) return "Give the collection a name.";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipe_collections")
    .insert({ household_id: member.householdId, name, created_by: member.id })
    .select("id")
    .single();
  if (error) return OWNERS_ONLY;
  done();
  redirect(`/galley/collections/${data.id}`);
}

export async function renameCollection(collectionId: string, _: Result, form: FormData): Promise<Result> {
  await currentMember();
  const name = text(form, "name");
  if (!name) return "Give the collection a name.";
  const supabase = await createClient();
  const { error } = await supabase.from("recipe_collections").update({ name }).eq("id", collectionId).select("id").single();
  if (error) return OWNERS_ONLY;
  done();
  return null;
}

export async function deleteCollection(collectionId: string): Promise<Result> {
  await currentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("recipe_collections").delete().eq("id", collectionId).select("id").single();
  if (error) return OWNERS_ONLY;
  done();
  redirect("/galley");
}

/** Adds a recipe to a collection, or takes it out. */
export async function fileRecipe(collectionId: string, recipeId: string, add: boolean): Promise<Result> {
  await currentMember();
  const supabase = await createClient();
  const { error } = add
    ? await supabase.from("collection_recipes").insert({ collection_id: collectionId, recipe_id: recipeId })
    : await supabase.from("collection_recipes").delete().eq("collection_id", collectionId).eq("recipe_id", recipeId).select("recipe_id").single();
  if (error && error.code !== "23505") return add ? "You can't add recipes to that collection." : "Only a Captain, or whoever added it, can take it out.";
  done();
  return null;
}

export async function shareCollection(collectionId: string, _: Result, form: FormData): Promise<Result> {
  await currentMember();
  const profile = text(form, "profile");
  const permission = text(form, "permission") === "contribute" ? "contribute" : "read";
  if (!profile) return "Pick who to share it with.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("collection_shares")
    .upsert({ collection_id: collectionId, profile_id: profile, permission }, { onConflict: "collection_id,profile_id" });
  if (error) return "Only a Captain can share collections, and only with people in the household.";
  done();
  return null;
}

export async function unshareCollection(collectionId: string, profileId: string): Promise<Result> {
  await currentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("collection_shares").delete().eq("collection_id", collectionId).eq("profile_id", profileId).select("profile_id").single();
  if (error) return OWNERS_ONLY;
  done();
  return null;
}
