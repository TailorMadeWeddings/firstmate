"use server";

// Every write goes through the signed-in user's own Supabase client, so the
// Ledger's owner-only row-level security applies on top of these checks.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  ACCOUNT_TYPES,
  type Category,
  notYetSaved,
  parseAmount,
  parseCommBankCsv,
  signed,
} from "@/lib/ledger";
import { currentOwner } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";

type Result = string | null;

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const optional = (form: FormData, key: string) => text(form, key) || null;

async function db() {
  const owner = await currentOwner();
  return { owner, supabase: await createClient() };
}

function done(error: { code?: string; message: string } | null, foreignKey?: string): Result {
  if (!error) {
    revalidatePath("/ledger", "layout");
    return null;
  }
  if (error.code === "23503" && foreignKey) return foreignKey;
  console.error(error);
  return "Couldn't save that. Try again.";
}

// ---------- accounts ----------

export async function addAccount(_: Result, form: FormData): Promise<Result> {
  const { owner, supabase } = await db();
  const name = text(form, "name");
  const type = text(form, "type");
  const opening = parseAmount(text(form, "opening_balance") || "0", true);
  if (!name) return "Give the account a name.";
  if (!ACCOUNT_TYPES.includes(type as (typeof ACCOUNT_TYPES)[number])) return "Pick an account type.";
  if (opening === null) return "Opening balance should look like 1250.00 (or -300 for a card).";
  const { error } = await supabase
    .from("budget_accounts")
    .insert({ household_id: owner.householdId, name, type, opening_balance: opening });
  return done(error);
}

// ---------- transactions ----------

/** The validated row a transaction form describes, or an error message. */
async function transactionFrom(
  supabase: Awaited<ReturnType<typeof createClient>>,
  form: FormData,
): Promise<Record<string, unknown> | string> {
  const amount = parseAmount(text(form, "amount"));
  const date = text(form, "date");
  if (!amount) return "Enter an amount, like 42.50.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Pick a date.";
  const { data: category } = await supabase
    .from("budget_categories")
    .select("type")
    .eq("id", text(form, "category_id"))
    .maybeSingle<Pick<Category, "type">>();
  if (!category) return "Pick a category.";
  return {
    account_id: text(form, "account_id"),
    category_id: text(form, "category_id"),
    date,
    amount: signed(amount, category.type),
    description: optional(form, "description"),
    notes: optional(form, "notes"),
  };
}

export async function addTransaction(_: Result, form: FormData): Promise<Result> {
  const { owner, supabase } = await db();
  const row = await transactionFrom(supabase, form);
  if (typeof row === "string") return row;
  const { error } = await supabase
    .from("budget_transactions")
    .insert({ ...row, household_id: owner.householdId });
  return done(error, "Pick an account.");
}

export async function updateTransaction(id: string, _: Result, form: FormData): Promise<Result> {
  const { supabase } = await db();
  const row = await transactionFrom(supabase, form);
  if (typeof row === "string") return row;
  const { error } = await supabase.from("budget_transactions").update(row).eq("id", id);
  if (error) return done(error, "Pick an account.");
  revalidatePath("/ledger", "layout");
  redirect("/ledger");
}

export async function deleteTransaction(id: string): Promise<Result> {
  const { supabase } = await db();
  const { error } = await supabase.from("budget_transactions").delete().eq("id", id);
  if (error) return done(error);
  revalidatePath("/ledger", "layout");
  redirect("/ledger");
}

/** A NetBank CSV export into one account. Rows come in uncategorised. */
export async function importCsv(_: Result, form: FormData): Promise<Result> {
  const { owner, supabase } = await db();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return "Choose a CSV file from NetBank.";
  const rows = parseCommBankCsv(await file.text());
  if (typeof rows === "string") return rows;
  const accountId = text(form, "account_id");
  const dates = rows.map((r) => r.date).sort();

  // Everything already saved in that date range, a page at a time (the API
  // caps each read at 1000 rows).
  const existing = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("budget_transactions")
      .select("date, amount, description")
      .eq("account_id", accountId)
      .gte("date", dates[0])
      .lte("date", dates.at(-1)!)
      .order("id")
      .range(from, from + 999);
    if (error) return done(error);
    existing.push(...data);
    if (data.length < 1000) break;
  }

  const fresh = notYetSaved(rows, existing);
  if (fresh.length) {
    const { error } = await supabase.from("budget_transactions").insert(
      fresh.map((r) => ({ ...r, household_id: owner.householdId, account_id: accountId })),
    );
    if (error) return done(error, "Pick an account.");
  }
  revalidatePath("/ledger", "layout");
  redirect(`/ledger?imported=${fresh.length}&skipped=${rows.length - fresh.length}`);
}

// ---------- categories ----------

export async function addCategory(_: Result, form: FormData): Promise<Result> {
  const { owner, supabase } = await db();
  const name = text(form, "name");
  const parentId = optional(form, "parent_category_id");
  let type = text(form, "type");
  if (!name) return "Give the category a name.";
  if (parentId) {
    // A sub-category is always the same kind as its parent.
    const { data: parent } = await supabase
      .from("budget_categories")
      .select("type")
      .eq("id", parentId)
      .maybeSingle<Pick<Category, "type">>();
    if (!parent) return "That parent category is gone.";
    type = parent.type;
  }
  if (type !== "income" && type !== "expense") return "Pick income or expense.";
  const { error } = await supabase.from("budget_categories").insert({
    household_id: owner.householdId,
    name,
    type,
    parent_category_id: parentId,
    color: optional(form, "color"),
    icon: optional(form, "icon"),
  });
  if (error?.code === "23505") return `There's already a category called ${name} there.`;
  return done(error);
}

export async function updateCategory(id: string, _: Result, form: FormData): Promise<Result> {
  const { supabase } = await db();
  const name = text(form, "name");
  if (!name) return "Give the category a name.";
  const { error } = await supabase
    .from("budget_categories")
    .update({ name, color: optional(form, "color"), icon: optional(form, "icon") })
    .eq("id", id);
  if (error?.code === "23505") return `There's already a category called ${name} there.`;
  return done(error);
}

export async function setArchived(id: string, archived: boolean): Promise<Result> {
  const { supabase } = await db();
  const { error } = await supabase
    .from("budget_categories")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  return done(error);
}

export async function deleteCategory(id: string): Promise<Result> {
  const { supabase } = await db();
  const { error } = await supabase.from("budget_categories").delete().eq("id", id);
  return done(error, "It has transactions, so archive it instead.");
}
