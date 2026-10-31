"use server";

// The shopping list, through the signed-in user's own client: row-level
// security lets the crew add, tick off and clear; Guests can't touch it.
import { revalidatePath } from "next/cache";
import { type Ingredient, shoppingLine } from "@/lib/galley";
import { addDays } from "@/lib/logbook";
import { currentCrew } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";

type Result = string | null;

const done = () => revalidatePath("/galley/shopping");

export async function addItem(_: Result, form: FormData): Promise<Result> {
  const member = await currentCrew();
  const name = String(form.get("name") ?? "").trim();
  if (!name) return "Say what to buy.";
  if (name.length > 200) return "Keep it under 200 characters.";
  const supabase = await createClient();
  const { error } = await supabase.from("shopping_items").insert({ household_id: member.householdId, name });
  if (error) {
    console.error(error);
    return "Couldn't add it. Try again.";
  }
  done();
  return null;
}

/** Recipes' ingredients onto the list: each for `serves` people, or as many as the recipe makes. */
async function addFromRecipes(wanted: { id: string; serves: number | null }[]): Promise<Result> {
  const member = await currentCrew();
  const supabase = await createClient();
  type Row = { id: string; servings: number | null; recipe_ingredients: (Ingredient & { position: number })[] };
  const { data, error: loading } = await supabase
    .from("recipes")
    .select("id, servings, recipe_ingredients(position, quantity, unit, name)")
    .in("id", [...new Set(wanted.map((w) => w.id))]);
  if (loading) throw loading;
  const recipes = new Map((data as Row[]).map((r) => [r.id, r]));
  // ponytail: no merging with what's already on the list ("2 eggs" + "3 eggs"); add it if the list gets long.
  const items = wanted.flatMap(({ id, serves }) => {
    const recipe = recipes.get(id);
    if (!recipe) return [];
    const base = recipe.servings ?? 1;
    const to = serves !== null && Number.isInteger(serves) && serves > 0 && serves <= 100 ? serves : base;
    return recipe.recipe_ingredients
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ household_id: member.householdId, recipe_id: id, name: shoppingLine(i, base, to) }));
  });
  if (items.length === 0) return wanted.length === 1 ? "That recipe has no ingredients." : "None of those meals have ingredients to buy.";
  const { error } = await supabase.from("shopping_items").insert(items);
  if (error) {
    console.error(error);
    return "Couldn't add them. Try again.";
  }
  done();
  return null;
}

/** A recipe's ingredients, for however many it's feeding, onto the list. */
export async function addRecipe(recipeId: string, serves: number): Promise<Result> {
  return addFromRecipes([{ id: recipeId, serves }]);
}

/** Everything for a week of planned meals (from Monday), onto the list. */
export async function addWeek(monday: string): Promise<Result> {
  await currentCrew();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(monday)) return "Pick a week.";
  const supabase = await createClient();
  const { data, error } = await supabase.from("meal_plans").select("recipe_id").gte("day", monday).lt("day", addDays(monday, 7)).not("recipe_id", "is", null);
  if (error) throw error;
  if (data.length === 0) return "No recipes planned that week.";
  return addFromRecipes(data.map((m) => ({ id: m.recipe_id as string, serves: null })));
}

export async function setChecked(itemId: string, checked: boolean): Promise<Result> {
  await currentCrew();
  const supabase = await createClient();
  const { error } = await supabase
    .from("shopping_items")
    .update({ checked_at: checked ? new Date().toISOString() : null })
    .eq("id", itemId)
    .select("id")
    .single();
  if (error) return "Couldn't tick that off. Try again.";
  done();
  return null;
}

export async function clearChecked(): Promise<Result> {
  const member = await currentCrew();
  const supabase = await createClient();
  const { error } = await supabase.from("shopping_items").delete().eq("household_id", member.householdId).not("checked_at", "is", null);
  if (error) return "Couldn't clear the list. Try again.";
  done();
  return null;
}
