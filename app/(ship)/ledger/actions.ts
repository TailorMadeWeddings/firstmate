"use server";

// Every write goes through the signed-in user's own Supabase client, so the
// Ledger's owner-only row-level security applies on top of these checks.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  ACCOUNT_TYPES,
  type Category,
  UNITS,
  type Unit,
  nextDue,
  parseAmount,
  ruleFor,
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

// ---------- recurring bills ----------

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** The validated columns a bill form describes, or an error message. */
function billFrom(form: FormData): Record<string, unknown> | string {
  const name = text(form, "name");
  const amount = parseAmount(text(form, "amount"));
  const interval = Number(text(form, "interval"));
  const unit = text(form, "unit") as Unit;
  const due = text(form, "next_due");
  if (!name) return "Give the bill a name.";
  if (!amount) return "Enter the usual amount, like 120.00.";
  if (!Number.isInteger(interval) || interval < 1 || interval > 52 || !(unit in UNITS)) {
    return "Say how often it repeats.";
  }
  if (!isDate(due)) return "Pick the next due date.";
  if (!text(form, "category_id") || !text(form, "account_id")) {
    return "Pick a category and the account it's paid from.";
  }
  return {
    name,
    amount,
    recurrence_rule: ruleFor(unit, interval, due),
    next_due: due,
    category_id: text(form, "category_id"),
    account_id: text(form, "account_id"),
    autopay: form.get("autopay") === "on",
  };
}

export async function addBill(_: Result, form: FormData): Promise<Result> {
  const { owner, supabase } = await db();
  const bill = billFrom(form);
  if (typeof bill === "string") return bill;
  const { error } = await supabase
    .from("budget_recurring_bills")
    .insert({ ...bill, household_id: owner.householdId });
  return done(error, "Pick a category and the account it's paid from.");
}

export async function updateBill(id: string, _: Result, form: FormData): Promise<Result> {
  const { supabase } = await db();
  const bill = billFrom(form);
  if (typeof bill === "string") return bill;
  const { error } = await supabase.from("budget_recurring_bills").update(bill).eq("id", id);
  return done(error, "Pick a category and the account it's paid from.");
}

export async function deleteBill(id: string): Promise<Result> {
  const { supabase } = await db();
  const { error } = await supabase.from("budget_recurring_bills").delete().eq("id", id);
  return done(error);
}

/** Records the payment as a transaction and moves the bill to its next due date. */
export async function payBill(id: string, _: Result, form: FormData): Promise<Result> {
  const { supabase } = await db();
  const amount = parseAmount(text(form, "amount"));
  const due = text(form, "due");
  const paidOn = text(form, "paid_on");
  if (!amount) return "Enter what was paid.";
  if (!isDate(due) || !isDate(paidOn)) return "Pick the date it was paid.";
  const { data: bill } = await supabase
    .from("budget_recurring_bills")
    .select("recurrence_rule")
    .eq("id", id)
    .maybeSingle<{ recurrence_rule: string }>();
  if (!bill) return "That bill is gone.";
  const { error } = await supabase.rpc("budget_pay_bill", {
    p_bill: id,
    p_due: due,
    p_next: nextDue(due, bill.recurrence_rule),
    p_paid_on: paidOn,
    p_amount: amount,
  });
  if (error?.code === "P0002") return "Already marked paid.";
  if (error?.code === "P0003") return "Give this bill a category and account first.";
  return done(error);
}

// ---------- savings goals ----------

export async function addGoal(_: Result, form: FormData): Promise<Result> {
  const { owner, supabase } = await db();
  const name = text(form, "name");
  const target = parseAmount(text(form, "target_amount"));
  const starting = parseAmount(text(form, "starting_amount") || "0", true);
  const date = text(form, "target_date");
  if (!name) return "Give the goal a name.";
  if (!target) return "Enter a target, like 5000.";
  if (starting === null || Number(starting) < 0) return "Already saved should be 0 or more.";
  if (date && !isDate(date)) return "Pick a target date, or leave it empty.";
  const { error } = await supabase.from("budget_savings_goals").insert({
    household_id: owner.householdId,
    name,
    target_amount: target,
    starting_amount: starting,
    target_date: date || null,
    account_id: optional(form, "account_id"),
  });
  return done(error);
}

/** Money put towards a goal, recorded in the account it now sits in. */
export async function contribute(goalId: string, _: Result, form: FormData): Promise<Result> {
  const { owner, supabase } = await db();
  const amount = parseAmount(text(form, "amount"));
  const date = text(form, "date");
  if (!amount) return "Enter an amount, like 200.";
  if (!isDate(date)) return "Pick a date.";
  const { error } = await supabase.from("budget_transactions").insert({
    household_id: owner.householdId,
    goal_id: goalId,
    account_id: text(form, "account_id"),
    date,
    amount,
  });
  return done(error, "Pick an account.");
}

export async function setGoalComplete(id: string, complete: boolean): Promise<Result> {
  const { supabase } = await db();
  const { error } = await supabase
    .from("budget_savings_goals")
    .update({ completed_at: complete ? new Date().toISOString() : null })
    .eq("id", id);
  return done(error);
}

export async function deleteGoal(id: string): Promise<Result> {
  const { supabase } = await db();
  const { error } = await supabase.from("budget_savings_goals").delete().eq("id", id);
  return done(error, "It has contributions, so mark it complete instead.");
}

export async function deleteContribution(id: string): Promise<Result> {
  const { supabase } = await db();
  const { error } = await supabase
    .from("budget_transactions")
    .delete()
    .eq("id", id)
    .not("goal_id", "is", null);
  return done(error);
}

// ---------- category budgets ----------

/** Sets a top-level expense category's monthly limit; an empty amount clears it. */
export async function setLimit(categoryId: string, _: Result, form: FormData): Promise<Result> {
  const { owner, supabase } = await db();
  const raw = text(form, "monthly_amount");
  if (!raw) {
    const { error } = await supabase.from("budget_limits").delete().eq("category_id", categoryId);
    return done(error);
  }
  const amount = parseAmount(raw);
  if (!amount) return "Enter a monthly amount, like 900.";
  const { data: category } = await supabase
    .from("budget_categories")
    .select("type, parent_category_id")
    .eq("id", categoryId)
    .maybeSingle<Pick<Category, "type" | "parent_category_id">>();
  if (!category) return "That category is gone.";
  if (category.type !== "expense" || category.parent_category_id) {
    return "Budgets go on top-level expense categories.";
  }
  const { error } = await supabase.from("budget_limits").upsert({
    category_id: categoryId,
    household_id: owner.householdId,
    monthly_amount: amount,
    updated_at: new Date().toISOString(),
  });
  return done(error);
}
