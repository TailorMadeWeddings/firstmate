// Small pure helpers for the Ledger screens.

export const ACCOUNT_TYPES = ["checking", "savings", "credit", "cash"] as const;

export type Category = {
  id: string;
  name: string;
  type: "income" | "expense";
  parent_category_id: string | null;
  archived_at: string | null;
  color: string | null;
  icon: string | null;
};

/**
 * A typed-in amount as a string Postgres reads exactly, or null if it isn't
 * one. "$1,234.5" → "1234.5". Positive only unless signed is set.
 */
export function parseAmount(input: string, signed = false): string | null {
  const s = input.trim().replace(/[$,\s]/g, "");
  const ok = signed ? /^-?\d{1,10}(\.\d{1,2})?$/ : /^\d{1,10}(\.\d{1,2})?$/;
  if (!ok.test(s) || (!signed && Number(s) === 0)) return null;
  return s;
}

/** Money out of an expense category is negative, money into income is positive. */
export const signed = (amount: string, type: Category["type"]) =>
  type === "expense" ? `-${amount}` : amount;

export const money = (n: number | string, currency = "AUD") =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(Number(n));

/** Today in Sydney, as YYYY-MM-DD for <input type="date">. */
export const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());

/** "Transport › Fuel" for a sub-category. */
export function label(c: Category, all: Category[]) {
  const parent = all.find((p) => p.id === c.parent_category_id);
  return parent ? `${parent.name} › ${c.name}` : c.name;
}

/**
 * Categories for an entry form: archived ones left out, the ones used most
 * recently first, then the rest in name order.
 * recentIds is category ids from the latest transactions, newest first.
 */
export function forEntry(all: Category[], recentIds: (string | null)[]) {
  const live = all.filter((c) => !c.archived_at);
  const rank = (c: Category) => {
    const i = recentIds.indexOf(c.id);
    return i < 0 ? Infinity : i;
  };
  return [...live].sort(
    (a, b) => rank(a) - rank(b) || label(a, all).localeCompare(label(b, all)),
  );
}
