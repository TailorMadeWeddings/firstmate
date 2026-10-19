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

export type Imported = { date: string; amount: string; description: string };

/** One CSV line's fields. Handles quoted fields with commas and "" in them. */
function csvFields(line: string) {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch !== '"') cur += ch;
      else if (line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * A NetBank CSV export: no header, one transaction per line as
 *   19/10/2026,"-12.50","WOOLWORTHS 1234 SYDNEY","+1,234.56"
 * (date, signed amount, description, balance after). Returns the rows, or
 * an error naming the first line that doesn't fit, so nothing is silently
 * dropped. A header line and $0.00 lines are skipped.
 */
export function parseCommBankCsv(csv: string): Imported[] | string {
  const rows: Imported[] = [];
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/);
  for (const [i, line] of lines.entries()) {
    if (!line.trim()) continue;
    const [d, a, desc] = csvFields(line);
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(d.trim());
    if (!m) {
      if (i === 0 && !/\d/.test(d)) continue; // a header someone added
      return `Line ${i + 1} doesn't start with a date like 19/10/2026. Is this a CommBank CSV?`;
    }
    const date = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    const t = new Date(date);
    if (Number.isNaN(+t) || t.toISOString().slice(0, 10) !== date) return `Line ${i + 1} has an impossible date.`;
    const amount = parseAmount((a ?? "").replace(/^\+/, ""), true);
    if (amount === null) return `Line ${i + 1} has an amount that isn't a number.`;
    if (Number(amount) === 0) continue;
    rows.push({ date, amount, description: (desc ?? "").replace(/\s+/g, " ").trim() });
  }
  return rows.length ? rows : "That file has no transactions in it.";
}

/**
 * The imported rows not already in the account, so importing overlapping
 * exports twice is harmless. Matches on date, amount and description, and
 * counts: two identical $5 coffees in the CSV and one already saved → one
 * new one.
 */
export function notYetSaved(
  rows: Imported[],
  existing: { date: string; amount: number | string; description: string | null }[],
) {
  const key = (r: { date: string; amount: number | string; description: string | null }) =>
    `${r.date}|${Number(r.amount).toFixed(2)}|${r.description ?? ""}`;
  const seen = new Map<string, number>();
  for (const r of existing) seen.set(key(r), (seen.get(key(r)) ?? 0) + 1);
  return rows.filter((r) => {
    const n = seen.get(key(r)) ?? 0;
    if (n > 0) seen.set(key(r), n - 1);
    return n === 0;
  });
}
