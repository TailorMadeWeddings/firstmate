// Loading the Galley. Reads go through the signed-in user's client, so
// row-level security decides what they see: the crew everything, others
// only collections shared with them (and recipes they added to those).
import { type Ingredient, PHOTO_BUCKET, type RecipeCard, type Step } from "@/lib/galley";
import { createClient } from "@/lib/supabase/server";

// Without generated database types the client guesses shapes, so callers
// say what the rows really are.
const must = <T,>({ data, error }: { data: unknown; error: unknown }): T => {
  if (error) throw error;
  return data as T;
};

/** Short-lived links to private photos, by path. */
async function signed(paths: (string | null)[]): Promise<Map<string, string>> {
  const wanted = paths.filter((p): p is string => Boolean(p));
  if (wanted.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(wanted, 60 * 60);
  return new Map((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])));
}

type CardRow = Omit<RecipeCard, "tags" | "ingredients" | "collections" | "cooked_at" | "photo"> & {
  photo_path: string | null;
  recipe_tags: { tag: string }[];
  recipe_ingredients: { name: string }[];
  collection_recipes: { collection_id: string }[];
  recipe_cooks: { cooked_at: string }[];
};

/** Every recipe you can see, with what browsing needs: tags, ingredient names, collections, last cooked, photo. */
export async function loadRecipeCards(): Promise<RecipeCard[]> {
  const supabase = await createClient();
  const rows = must<CardRow[]>(
    await supabase
      .from("recipes")
      .select(
        "id, title, description, servings, prep_minutes, cook_minutes, created_at, photo_path, recipe_tags(tag), recipe_ingredients(name), collection_recipes(collection_id), recipe_cooks(cooked_at)",
      )
      .order("cooked_at", { referencedTable: "recipe_cooks", ascending: false })
      .limit(1, { referencedTable: "recipe_cooks" }),
  );
  const photos = await signed(rows.map((r) => r.photo_path));
  return rows.map(({ recipe_tags, recipe_ingredients, collection_recipes, recipe_cooks, photo_path, ...r }) => ({
    ...r,
    tags: recipe_tags.map((t) => t.tag).sort(),
    ingredients: recipe_ingredients.map((i) => i.name),
    collections: collection_recipes.map((c) => c.collection_id),
    cooked_at: recipe_cooks[0]?.cooked_at ?? null,
    photo: photo_path ? (photos.get(photo_path) ?? null) : null,
  }));
}

export type Collection = {
  id: string;
  name: string;
  household_id: string;
  recipes: number;
  /** Who it's shared with. Owners see every share; anyone else only their own. */
  shares: { profile_id: string; permission: "read" | "contribute" }[];
};

export async function loadCollections(): Promise<Collection[]> {
  const supabase = await createClient();
  type Row = Omit<Collection, "recipes" | "shares"> & {
    collection_recipes: { count: number }[];
    collection_shares: Collection["shares"];
  };
  const rows = must<Row[]>(
    await supabase
      .from("recipe_collections")
      .select("id, name, household_id, collection_recipes(count), collection_shares(profile_id, permission)")
      .order("name"),
  );
  return rows.map(({ collection_recipes, collection_shares, ...c }) => ({
    ...c,
    shares: collection_shares,
    recipes: collection_recipes[0]?.count ?? 0,
  }));
}

/** What the signed-in member may do with a collection. */
export function accessTo(c: Collection, member: { id: string; role: string }): "owner" | "contribute" | "read" {
  if (member.role === "owner") return "owner";
  return c.shares.find((s) => s.profile_id === member.id)?.permission ?? "read";
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
  household_id: string;
  photo: string | null;
  photo_path: string | null;
  collections: string[];
  cooked_at: string | null;
  ingredients: Ingredient[];
  steps: Step[];
  tags: string[];
};

export async function loadRecipe(id: string): Promise<Recipe | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .select(
      "id, title, description, source_url, servings, prep_minutes, cook_minutes, created_by, household_id, photo_path, recipe_ingredients(position, quantity, unit, name, notes), recipe_steps(position, instruction, duration_seconds), recipe_tags(tag), collection_recipes(collection_id), recipe_cooks(cooked_at)",
    )
    .eq("id", id)
    .order("cooked_at", { referencedTable: "recipe_cooks", ascending: false })
    .limit(1, { referencedTable: "recipe_cooks" })
    .maybeSingle();
  // A malformed id is "not found" too.
  if (error || !data) return null;
  type Row = Omit<Recipe, "ingredients" | "steps" | "tags" | "photo" | "collections" | "cooked_at"> & {
    recipe_ingredients: (Ingredient & { position: number })[];
    recipe_steps: (Step & { position: number })[];
    recipe_tags: { tag: string }[];
    collection_recipes: { collection_id: string }[];
    recipe_cooks: { cooked_at: string }[];
  };
  const { recipe_ingredients, recipe_steps, recipe_tags, collection_recipes, recipe_cooks, ...r } = data as unknown as Row;
  const photos = await signed([r.photo_path]);
  const byPosition = <T extends { position: number }>(xs: T[]) => [...xs].sort((a, b) => a.position - b.position);
  return {
    ...r,
    photo: r.photo_path ? (photos.get(r.photo_path) ?? null) : null,
    collections: collection_recipes.map((c) => c.collection_id),
    cooked_at: recipe_cooks[0]?.cooked_at ?? null,
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
