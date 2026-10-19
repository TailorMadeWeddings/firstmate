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

// ---------- bill schedules ----------
// ponytail: only "every N weeks / months / years" RRULEs, which is all the
// bill form makes. Use an RRULE library if bills ever need more.

export const UNITS = { weeks: "WEEKLY", months: "MONTHLY", years: "YEARLY" } as const;
export type Unit = keyof typeof UNITS;

const parts = (rule: string) =>
  Object.fromEntries(rule.split(";").map((p) => p.split("="))) as Record<string, string>;

/** RRULE for "every N units", anchored to the first due date's day (and month). */
export function ruleFor(unit: Unit, interval: number, firstDue: string): string {
  const [, m, d] = firstDue.split("-").map(Number);
  let rule = `FREQ=${UNITS[unit]};INTERVAL=${interval}`;
  if (unit !== "weeks") rule += `;BYMONTHDAY=${d}`;
  if (unit === "years") rule += `;BYMONTH=${m}`;
  return rule;
}

export function scheduleOf(rule: string): { unit: Unit; interval: number } {
  const p = parts(rule);
  const unit = (Object.keys(UNITS) as Unit[]).find((u) => UNITS[u] === p.FREQ) ?? "months";
  return { unit, interval: Number(p.INTERVAL ?? 1) };
}

export function scheduleLabel(rule: string): string {
  const { unit, interval } = scheduleOf(rule);
  if (interval === 1) return { weeks: "Weekly", months: "Monthly", years: "Yearly" }[unit];
  if (unit === "weeks" && interval === 2) return "Fortnightly";
  if (unit === "months" && interval === 3) return "Quarterly";
  return `Every ${interval} ${unit}`;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The due date after `due`. The 31st falls on the last day of shorter months. */
export function nextDue(due: string, rule: string): string {
  const p = parts(rule);
  const { unit, interval } = scheduleOf(rule);
  const [y, m, d] = due.split("-").map(Number);
  if (unit === "weeks") return iso(new Date(Date.UTC(y, m - 1, d + 7 * interval)));
  const months = unit === "months" ? interval : 12 * interval;
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const day = Math.min(Number(p.BYMONTHDAY ?? d), daysIn(ny, nm));
  return iso(new Date(Date.UTC(ny, nm - 1, day)));
}

/** Whole days from today until the date; negative when it's past. */
export const daysUntil = (date: string, from = today()) =>
  Math.round((Date.parse(date) - Date.parse(from)) / 86_400_000);

// ---------- savings goals ----------

/**
 * How a goal is going. Pace assumes saving evenly from when the goal was set
 * up to its target date; ahead means at or above where that line is today.
 */
export function pace(
  goal: { target_amount: number; target_date: string | null; created_at: string },
  saved: number,
  on = today(),
) {
  const target = Number(goal.target_amount);
  const percent = Math.min(100, Math.max(0, Math.round((saved / target) * 100)));
  if (!goal.target_date || saved >= target) return { percent, ahead: saved >= target, perMonth: null };
  const start = goal.created_at.slice(0, 10);
  const total = daysUntil(goal.target_date, start);
  const left = daysUntil(goal.target_date, on);
  const expected = total > 0 ? target * Math.min(1, (total - left) / total) : target;
  const monthsLeft = Math.max(left / 30.44, 1);
  return {
    percent,
    ahead: saved >= expected,
    perMonth: Math.ceil(((target - saved) / monthsLeft) * 100) / 100,
  };
}

// ---------- reports ----------

/** "2026-10" plus n months. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

const monthsFrom = (from: string, to: string) => {
  const out = [from];
  while (out[out.length - 1] < to) out.push(addMonths(out[out.length - 1], 1));
  return out;
};

export type Period = { from: string; to: string; months: string[]; previous: { from: string; to: string } };

/**
 * The months a report covers, from ?from=YYYY-MM&to=YYYY-MM. Anything
 * missing or malformed falls back to this month; a backwards range is
 * swapped. "previous" is the same number of months just before.
 */
export function period(from?: string, to?: string, now = today()): Period {
  const valid = (s?: string) => (s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : null);
  const current = now.slice(0, 7);
  let a = valid(from) ?? valid(to) ?? current;
  let b = valid(to) ?? a;
  if (a > b) [a, b] = [b, a];
  const months = monthsFrom(a, b).slice(-120); // ponytail: at most ten years
  a = months[0];
  return { from: a, to: b, months, previous: { from: addMonths(a, -months.length), to: addMonths(a, -1) } };
}

export type MonthlyTotal = {
  month: string; // YYYY-MM-01, as the view returns it
  category_id: string | null;
  money_in: number;
  money_out: number;
};

const inRange = (r: MonthlyTotal, from: string, to: string) =>
  r.month.slice(0, 7) >= from && r.month.slice(0, 7) <= to;

export function totals(rows: MonthlyTotal[], from: string, to: string) {
  let moneyIn = 0;
  let moneyOut = 0;
  for (const r of rows) {
    if (!inRange(r, from, to)) continue;
    moneyIn += Number(r.money_in);
    moneyOut += Number(r.money_out);
  }
  // Round once at the end so floating point never shows up as 0.30000000000000004.
  const cents = (n: number) => Math.round(n * 100) / 100;
  return { moneyIn: cents(moneyIn), moneyOut: cents(moneyOut), net: cents(moneyIn - moneyOut) };
}

/**
 * Spending per top-level category (sub-categories roll up into their
 * parent), biggest first. Uncategorised spending has id null.
 */
export function spendingByCategory(rows: MonthlyTotal[], categories: Category[], from: string, to: string) {
  const topOf = (id: string | null) => {
    const c = categories.find((x) => x.id === id);
    return c?.parent_category_id ?? id;
  };
  const sums = new Map<string | null, number>();
  for (const r of rows) {
    if (!inRange(r, from, to) || !Number(r.money_out)) continue;
    const top = topOf(r.category_id);
    sums.set(top, (sums.get(top) ?? 0) + Number(r.money_out));
  }
  return [...sums]
    .map(([id, amount]) => ({ id, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount);
}

/** Money in and out for each month, oldest first. */
export function monthly(rows: MonthlyTotal[], months: string[]) {
  return months.map((month) => ({ month, ...totals(rows, month, month) }));
}

/** A category and its sub-categories, for drilling into a report. */
export const withChildren = (id: string, categories: Category[]) => [
  id,
  ...categories.filter((c) => c.parent_category_id === id).map((c) => c.id),
];

// ---------- category budgets ----------

/** Share of a limit that counts as getting close. */
export const NEAR_LIMIT = 0.85;

/** How a category is doing against its limit: ok, near (85%+) or over. */
export function budgetStatus(spent: number, limit: number) {
  const cents = (n: number) => Math.round(n * 100) / 100;
  return {
    percent: Math.round((spent / limit) * 100),
    left: cents(limit - spent),
    state: spent > limit ? ("over" as const) : spent >= limit * NEAR_LIMIT ? ("near" as const) : ("ok" as const),
  };
}

// ---------- transfers ----------

export type TransferLeg = {
  account_id: string;
  amount: number;
  date: string;
  description: string | null;
  transfer_id: string | null;
  goal_id?: string | null;
};

export type Transfer = { from: string; to: string; amount: number; date: string; note: string | null; goalId: string | null };

/** Both halves of each transfer, joined up: from the account that paid, to the one that received. */
export function transfersById(legs: TransferLeg[]): Record<string, Transfer> {
  const out: Record<string, Transfer> = {};
  for (const leg of legs) {
    if (!leg.transfer_id) continue;
    const t = (out[leg.transfer_id] ??= {
      from: "", to: "", amount: Math.abs(Number(leg.amount)), date: leg.date, note: leg.description, goalId: null,
    });
    if (Number(leg.amount) < 0) t.from = leg.account_id;
    else {
      t.to = leg.account_id;
      t.goalId = leg.goal_id ?? null;
    }
  }
  return out;
}

/** A list with each transfer shown once (its first half to appear), in the same order. */
export function onePerTransfer<T extends { transfer_id: string | null }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => !r.transfer_id || (!seen.has(r.transfer_id) && seen.add(r.transfer_id)));
}
