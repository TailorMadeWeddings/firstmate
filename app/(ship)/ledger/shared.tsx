import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { type Category, forEntry, label, today } from "@/lib/ledger";
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
