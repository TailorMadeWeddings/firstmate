"use server";

// The meal plan, through the signed-in user's own client: row-level security
// lets the crew plan and clear lunch and dinner; Guests can't touch it.
import { revalidatePath } from "next/cache";
import { MEALS, type MealSlot } from "@/lib/galley";
import { currentCrew } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";

type Result = string | null;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const done = () => {
  revalidatePath("/galley/meals");
  revalidatePath("/logbook", "layout");
  revalidatePath("/");
};

async function save(day: string, meal: string, title: string, recipeId: string | null): Promise<Result> {
  const member = await currentCrew();
  if (!DAY.test(day) || !(meal in MEALS)) return "Pick a day, and lunch or dinner.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("meal_plans")
    .upsert({ household_id: member.householdId, day, meal: meal as MealSlot, title, recipe_id: recipeId, added_by: member.id }, { onConflict: "household_id,day,meal" });
  if (error) {
    console.error(error);
    return "Couldn't plan it. Try again.";
  }
  done();
  return null;
}

/** The planner's slot: a recipe's name makes it that recipe; anything else ("Leftovers") is just written in. */
export async function planMeal(day: string, meal: string, _: Result, form: FormData): Promise<Result> {
  const what = String(form.get("what") ?? "").trim();
  if (!what) return "Say what's for it.";
  if (what.length > 200) return "Keep it under 200 characters.";
  const supabase = await createClient();
  // ilike with the wildcards escaped: the same name, whatever the case.
  const { data: recipe } = await supabase.from("recipes").select("id, title").ilike("title", what.replace(/[\\%_]/g, "\\$&")).limit(1).maybeSingle();
  return save(day, meal, recipe?.title ?? what, recipe?.id ?? null);
}

/** A recipe page's "Add to meal plan". */
export async function planRecipe(recipeId: string, _: Result, form: FormData): Promise<Result> {
  const supabase = await createClient();
  const { data: recipe } = await supabase.from("recipes").select("title").eq("id", recipeId).maybeSingle();
  if (!recipe) return "That recipe has gone.";
  return save(String(form.get("date") ?? ""), String(form.get("meal") ?? ""), recipe.title, recipeId);
}

export async function clearMeal(day: string, meal: string): Promise<Result> {
  const member = await currentCrew();
  const supabase = await createClient();
  const { error } = await supabase.from("meal_plans").delete().eq("household_id", member.householdId).eq("day", day).eq("meal", meal);
  if (error) return "Couldn't clear it. Try again.";
  done();
  return null;
}
