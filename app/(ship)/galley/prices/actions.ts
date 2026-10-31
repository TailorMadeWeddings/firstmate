"use server";

// Following ingredients' prices. What's followed is saved through the
// signed-in user's own client (row-level security: the crew follow, Owners or
// whoever added it stop); the first prices are fetched straight away, with
// the secret key, since only the server writes prices.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dayKey } from "@/lib/logbook";
import { currentCrew } from "@/lib/players";
import { pull } from "@/lib/prices";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Result = string | null;

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim().replace(/\s+/g, " ");

export async function followIngredient(_: Result, form: FormData): Promise<Result> {
  const member = await currentCrew();
  const name = text(form, "name");
  const search = text(form, "search") || name;
  if (!name) return "Say which ingredient.";
  if (name.length > 80 || search.length > 80) return "Keep it under 80 letters.";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("price_items")
    .insert({ household_id: member.householdId, name, search, created_by: member.id })
    .select("id, household_id, search")
    .single();
  if (error) {
    if (error.code === "23505") return `${name} is already followed.`;
    console.error(error);
    return "Couldn't add that. Try again.";
  }
  const { failed } = await pull(createAdminClient(), [data], dayKey(new Date()));
  if (failed.length) console.error(`Price check: ${failed.join("; ")}`);
  revalidatePath("/galley/prices", "layout");
  return null;
}

export async function changeSearch(itemId: string, _: Result, form: FormData): Promise<Result> {
  await currentCrew();
  const search = text(form, "search");
  if (!search || search.length > 80) return "Give a search, under 80 letters.";
  const supabase = await createClient();
  const { data, error } = await supabase.from("price_items").update({ search }).eq("id", itemId).select("id, household_id, search").single();
  if (error) return "Couldn't change that. Try again.";
  // Check again now, so the new search shows today rather than tomorrow.
  await pull(createAdminClient(), [data], dayKey(new Date()));
  revalidatePath("/galley/prices", "layout");
  return null;
}

export async function unfollow(itemId: string): Promise<Result> {
  await currentCrew();
  const supabase = await createClient();
  const { data, error } = await supabase.from("price_items").delete().eq("id", itemId).select("id");
  if (error || !data?.length) return "Only a Captain, or whoever added it, can stop following this.";
  revalidatePath("/galley/prices", "layout");
  redirect("/galley/prices");
}
