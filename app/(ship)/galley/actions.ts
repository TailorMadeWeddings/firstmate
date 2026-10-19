"use server";

// Saving and deleting recipes, through the signed-in user's own client:
// row-level security lets the crew add recipes, Captains change any, and
// Officers change their own.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseIngredients, parseSteps, parseTags } from "@/lib/galley";
import { currentCrew } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";

type Result = string | null;

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

/** A whole number in range, null when blank, or undefined when it isn't one. */
function whole(form: FormData, key: string, max: number): number | null | undefined {
  const raw = text(form, key);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : undefined;
}

export async function saveRecipe(recipeId: string | null, _: Result, form: FormData): Promise<Result> {
  const member = await currentCrew();
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
  });
  if (error) {
    if (error.code === "P0020") return "Only a Captain, or whoever added this recipe, can change it.";
    console.error(error);
    return "Couldn't save the recipe. Try again.";
  }
  revalidatePath("/galley", "layout");
  redirect(`/galley/${id}`);
}

export async function deleteRecipe(recipeId: string): Promise<Result> {
  await currentCrew();
  const supabase = await createClient();
  const { error } = await supabase.from("recipes").delete().eq("id", recipeId).select("id").single();
  if (error) {
    return error.code === "PGRST116" ? "Only a Captain, or whoever added this recipe, can delete it." : "Couldn't delete it. Try again.";
  }
  revalidatePath("/galley", "layout");
  redirect("/galley");
}
