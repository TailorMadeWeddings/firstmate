import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import {
  type Category,
  UNITS,
  type MonthlyTotal,
  type Transfer,
  type Unit,
  budgetStatus,
  daysUntil,
  forEntry,
  label,
  money,
  scheduleLabel,
  scheduleOf,
  today,
} from "@/lib/ledger";
import { payBill } from "./actions";
import { createClient } from "@/lib/supabase/server";

export type Account = {
  id: string;
  name: string;
  type: string;
  currency: string;
  opening_balance: number;
};

export type Transaction = {
  id: string;
  date: string;
  amount: number;
  description: string | null;
  notes: string | null;
  account_id: string;
  category_id: string | null;
  goal_id: string | null;
  transfer_id: string | null;
};

export type Bill = {
  id: string;
  name: string;
  amount: number;
  recurrence_rule: string;
  next_due: string;
  last_paid: string | null;
  category_id: string | null;
  account_id: string | null;
  autopay: boolean;
};

export type Goal = {
  id: string;
  name: string;
  target_amount: number;
  starting_amount: number;
  target_date: string | null;
  account_id: string | null;
  completed_at: string | null;
  created_at: string;
};

const must = <T,>({ data, error }: { data: T | null; error: unknown }): T => {
  if (error) throw error;
  return data as T;
};

export async function loadAccounts() {
  const supabase = await createClient();
  return must<Account[]>(
    await supabase
      .from("budget_accounts")
      .select("id, name, type, currency, opening_balance")
      .order("name"),
  );
}

export async function loadCategories() {
  const supabase = await createClient();
  return must<Category[]>(
    await supabase
      .from("budget_categories")
      .select("id, name, type, parent_category_id, archived_at, color, icon")
      .order("name"),
  );
}

export async function loadBills() {
  const supabase = await createClient();
  return must<Bill[]>(
    await supabase
      .from("budget_recurring_bills")
      .select("id, name, amount, recurrence_rule, next_due, last_paid, category_id, account_id, autopay")
      .order("next_due"),
  );
}

export async function loadGoals() {
  const supabase = await createClient();
  return must<Goal[]>(
    await supabase
      .from("budget_savings_goals")
      .select("id, name, target_amount, starting_amount, target_date, account_id, completed_at, created_at")
      .order("created_at"),
  );
}

export type Limit = { category_id: string; monthly_amount: number };

export async function loadLimits() {
  const supabase = await createClient();
  return must<Limit[]>(await supabase.from("budget_limits").select("category_id, monthly_amount"));
}

/** Money in and out per category for the given months (YYYY-MM), from the totals view. */
export async function loadMonthlyTotals(from: string, to: string) {
  const supabase = await createClient();
  return must<MonthlyTotal[]>(
    await supabase
      .from("budget_monthly_totals")
      .select("month, category_id, money_in, money_out")
      .gte("month", `${from}-01`)
      .lte("month", `${to}-01`),
  );
}

/**
 * Spent against a limit. The bar fills to the limit and the label says what's
 * left or how far over, so the state never rests on colour alone.
 */
export function BudgetBar({ spent, limit }: { spent: number; limit: number }) {
  const { percent, left, state } = budgetStatus(spent, limit);
  const fill = { ok: "bg-emerald-600", near: "bg-amber-500", over: "bg-red-600" }[state];
  return (
    <div className="flex flex-col gap-1">
      <div
        role="meter"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${percent}% of budget used`}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <p className="flex justify-between gap-2 text-xs">
        <span className="tabular-nums text-muted-foreground">
          {money(spent)} of {money(limit)}
        </span>
        <span
          className={
            state === "over"
              ? "font-semibold text-red-600"
              : state === "near"
                ? "text-amber-700 dark:text-amber-400"
                : "text-muted-foreground"
          }
        >
          {state === "over" ? `▲ Over by ${money(-left)}` : `${money(left)} left`}
        </span>
      </p>
    </div>
  );
}

/** "Overdue 3 days", "Due today", "Due in 5 days" */
export function dueLabel(date: string) {
  const days = daysUntil(date);
  if (days < 0) return `Overdue ${-days} day${days === -1 ? "" : "s"}`;
  if (days === 0) return "Due today";
  return `Due in ${days} day${days === 1 ? "" : "s"}`;
}

/** One bill with its due date, and a form to record paying it. */
export function BillRow({ bill, children }: { bill: Bill; children?: React.ReactNode }) {
  const overdue = daysUntil(bill.next_due) < 0;
  return (
    <div className={`flex flex-col gap-2 px-4 py-3 ${overdue ? "bg-red-50 dark:bg-red-950/40" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span className="font-medium">
          {bill.name}
          {bill.autopay && <span className="ml-2 text-xs text-muted-foreground">auto-pay</span>}
        </span>
        <span className="tabular-nums">{money(bill.amount)}</span>
        <span
          className={`basis-full text-xs ${overdue ? "font-semibold text-red-600" : "text-muted-foreground"}`}
        >
          {dueLabel(bill.next_due)} · {bill.next_due} · {scheduleLabel(bill.recurrence_rule)}
        </span>
      </div>
      <ActionForm action={payBill.bind(null, bill.id)} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="due" value={bill.next_due} />
        <Input
          name="amount"
          aria-label="Amount paid"
          inputMode="decimal"
          defaultValue={Number(bill.amount).toFixed(2)}
          className="w-28"
        />
        <Input name="paid_on" aria-label="Paid on" type="date" defaultValue={today()} className="w-40" />
        <Button size="sm" variant="secondary">
          Mark paid
        </Button>
      </ActionForm>
      {children}
    </div>
  );
}

/** Fields for adding or editing a bill. */
export function BillFields({
  accounts,
  categories,
  value,
}: {
  accounts: Account[];
  categories: Category[];
  value?: Bill;
}) {
  const schedule = value ? scheduleOf(value.recurrence_rule) : { unit: "months" as Unit, interval: 1 };
  const expenses = forEntry(categories, []).filter((c) => c.type === "expense");
  const id = (name: string) => `${name}-${value?.id ?? "new"}`;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="grid gap-1">
        <Label htmlFor={id("name")}>Name</Label>
        <Input id={id("name")} name="name" placeholder="Electricity" defaultValue={value?.name} required />
      </div>
      <div className="grid gap-1">
        <Label htmlFor={id("amount")}>Usual amount</Label>
        <Input
          id={id("amount")}
          name="amount"
          inputMode="decimal"
          placeholder="0.00"
          defaultValue={value ? Number(value.amount).toFixed(2) : undefined}
          required
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor={id("next_due")}>Next due</Label>
        <Input id={id("next_due")} name="next_due" type="date" defaultValue={value?.next_due} required />
      </div>
      <div className="grid gap-1">
        <Label htmlFor={id("interval")}>Repeats every</Label>
        <div className="flex gap-2">
          <Input
            id={id("interval")}
            name="interval"
            type="number"
            min={1}
            max={52}
            defaultValue={schedule.interval}
            className="w-20"
          />
          <NativeSelect name="unit" aria-label="Unit" defaultValue={schedule.unit}>
            {(Object.keys(UNITS) as Unit[]).map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="grid gap-1">
        <Label htmlFor={id("category")}>Category</Label>
        <NativeSelect id={id("category")} name="category_id" defaultValue={value?.category_id ?? ""} required>
          <option value="" disabled>
            Choose…
          </option>
          {expenses.map((c) => (
            <option key={c.id} value={c.id}>
              {label(c, categories)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1">
        <Label htmlFor={id("account")}>Paid from</Label>
        <NativeSelect id={id("account")} name="account_id" defaultValue={value?.account_id ?? undefined}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="autopay" defaultChecked={value?.autopay} className="size-4" />
        Paid automatically by the bank
      </label>
    </div>
  );
}

/** From, to, amount, date and an optional note, for a new transfer or an edit. */
export function TransferFields({ accounts, value }: { accounts: Account[]; value?: Transfer }) {
  const id = (name: string) => `${name}-${value ? "edit" : "new"}`;
  const pick = (name: string, labelText: string, selected?: string) => (
    <div className="grid gap-1">
      <Label htmlFor={id(name)}>{labelText}</Label>
      <NativeSelect id={id(name)} name={name} defaultValue={selected ?? ""} required>
        <option value="" disabled>
          Choose…
        </option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {pick("from_account_id", "From", value?.from)}
      {pick("to_account_id", "To", value?.to)}
      <div className="grid gap-1">
        <Label htmlFor={id("amount")}>Amount</Label>
        <Input
          id={id("amount")}
          name="amount"
          inputMode="decimal"
          placeholder="0.00"
          defaultValue={value ? Number(value.amount).toFixed(2) : undefined}
          required
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor={id("date")}>Date</Label>
        <Input id={id("date")} name="date" type="date" defaultValue={value?.date ?? today()} />
      </div>
      <div className="grid gap-1 sm:col-span-2">
        <Label htmlFor={id("note")}>Note (optional)</Label>
        <Input id={id("note")} name="note" placeholder="Paying off the card" defaultValue={value?.note ?? ""} />
      </div>
    </div>
  );
}

/** Amount, category and account up front; the rest tucked under "More". */
export function TransactionFields({
  accounts,
  categories,
  recentCategoryIds,
  value,
}: {
  accounts: Account[];
  categories: Category[];
  recentCategoryIds: (string | null)[];
  value?: Transaction;
}) {
  const choices = forEntry(categories, recentCategoryIds);
  // Editing a transaction whose category was since archived keeps it selectable.
  const current = categories.find((c) => c.id === value?.category_id);
  if (current && !choices.includes(current)) choices.unshift(current);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            required
            defaultValue={value ? Math.abs(value.amount).toFixed(2) : undefined}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="category_id">Category</Label>
          <NativeSelect
            id="category_id"
            name="category_id"
            required
            defaultValue={value?.category_id ?? ""}
          >
            <option value="" disabled>
              Choose…
            </option>
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon ? `${c.icon} ` : ""}
                {label(c, categories)}
                {c.type === "income" ? " (in)" : ""}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="account_id">Account</Label>
          <NativeSelect id="account_id" name="account_id" defaultValue={value?.account_id}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <details className="group" open={!!value}>
        <summary className="cursor-pointer text-sm text-muted-foreground">More</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1">
            <Label htmlFor="date">Date</Label>
            <Input id="date" name="date" type="date" defaultValue={value?.date ?? today()} />
          </div>
          <div className="grid gap-1 sm:col-span-2">
            <Label htmlFor="description">Payee or description</Label>
            <Input id="description" name="description" defaultValue={value?.description ?? ""} />
          </div>
          <div className="grid gap-1 sm:col-span-3">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" name="notes" defaultValue={value?.notes ?? ""} />
          </div>
        </div>
      </details>
    </>
  );
}
