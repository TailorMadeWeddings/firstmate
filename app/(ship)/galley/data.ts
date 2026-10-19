// Loading the Galley. Reads go through the signed-in user's client, so
// row-level security decides what they see (crew only).
import type { Ingredient, RecipeCard, Step } from "@/lib/galley";
import { createClient } from "@/lib/supabase/server";

// Without generated database types the client guesses shapes, so callers
// say what the rows really are.
const must = <T,>({ data, error }: { data: unknown; error: unknown }): T => {
  if (error) throw error;
  return data as T;
};

type CardRow = Omit<RecipeCard, "tags" | "ingredients"> & {
  recipe_tags: { tag: string }[];
  recipe_ingredients: { name: string }[];
};

/** Every recipe, with its tags and ingredient names for searching. */
export async function loadRecipeCards(): Promise<RecipeCard[]> {
  const supabase = await createClient();
  const rows = must<CardRow[]>(
    await supabase
      .from("recipes")
      .select("id, title, description, servings, prep_minutes, cook_minutes, created_at, recipe_tags(tag), recipe_ingredients(name)"),
  );
  return rows.map(({ recipe_tags, recipe_ingredients, ...r }) => ({
    ...r,
    tags: recipe_tags.map((t) => t.tag).sort(),
    ingredients: recipe_ingredients.map((i) => i.name),
  }));
}

export type Recipe = {
  id: string;
  title: string;
  description: string | null;
  source_url: string | null;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  created_by: string;
  ingredients: Ingredient[];
  steps: Step[];
  tags: string[];
};

export async function loadRecipe(id: string): Promise<Recipe | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .select(
      "id, title, description, source_url, servings, prep_minutes, cook_minutes, created_by, recipe_ingredients(position, quantity, unit, name, notes), recipe_steps(position, instruction, duration_seconds), recipe_tags(tag)",
    )
    .eq("id", id)
    .maybeSingle();
  // A malformed id is "not found" too.
  if (error || !data) return null;
  type Row = Omit<Recipe, "ingredients" | "steps" | "tags"> & {
    recipe_ingredients: (Ingredient & { position: number })[];
    recipe_steps: (Step & { position: number })[];
    recipe_tags: { tag: string }[];
  };
  const { recipe_ingredients, recipe_steps, recipe_tags, ...r } = data as unknown as Row;
  const byPosition = <T extends { position: number }>(xs: T[]) => [...xs].sort((a, b) => a.position - b.position);
  return {
    ...r,
    ingredients: byPosition(recipe_ingredients).map((i) => ({
      quantity: i.quantity === null ? null : Number(i.quantity),
      unit: i.unit,
      name: i.name,
      notes: i.notes,
    })),
    steps: byPosition(recipe_steps).map((s) => ({ instruction: s.instruction, duration_seconds: s.duration_seconds })),
    tags: recipe_tags.map((t) => t.tag).sort(),
  };
}
