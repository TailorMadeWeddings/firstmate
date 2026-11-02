// Afterpay "Pay in 4" statements into rows for the Ledger's importer, for an
// Afterpay account (type credit, balance = minus what's owed). Orders are
// money out under the shop's name, refunds money back under it, late fees
// money out, and every repayment (an instalment, a bundle, or a fee being
// paid) money in as "Afterpay payment", to be marked an own-account transfer.

export type Row = { date: string; cents: number; description: string; order: string | null };
/** opening and closing are what was owed, in cents. */
export type Statement = { opening: number; closing: number; rows: Row[] };

const MONEY = /^\+?\$[\d,]+\.\d\d$/;
const cents = (s: string) => Math.round(Number(s.replace(/[+$,]/g, "")) * 100);
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export const PAYMENT = "Afterpay payment";
export const PLUS = "Afterpay Plus";

/**
 * One statement from its text lines, each "page|y|x|text" with y from the
 * top of the page, as PDFKit reads them (scripts/afterpay-statements.ts).
 * Lines are put back into the statement's rows by position: PDFKit's own
 * reading order sometimes moves an amount away from its row.
 */
export function parseStatement(lines: string): Statement {
  const rows = new Map<string, { text: [number, string][]; amount: string | null }>();
  let opening: number | undefined;
  let closing: number | undefined;
  let endYear = 0;
  let endMonth = 0;
  for (const raw of lines.split("\n")) {
    const [page, y, x, ...rest] = raw.split("|");
    const text = rest.join("|");
    if (!text) continue;
    const balance = /^(Opening|Closing) balance \$([\d,.]+)$/.exec(text);
    if (balance) {
      if (balance[1] === "Opening") opening = cents(balance[2]);
      else closing = cents(balance[2]);
      continue;
    }
    // "21 Dec - 20 Jan 2027": rows dated after the end month are the year before.
    const period = /^\d+ \w+ - \d+ (\w+) (\d{4})$/.exec(text);
    if (period) {
      endMonth = MONTHS.indexOf(period[1].slice(0, 3).toLowerCase()) + 1;
      endYear = Number(period[2]);
      continue;
    }
    const key = `${page.padStart(3, "0")}|${y.padStart(5, "0")}`;
    const row = rows.get(key) ?? { text: [], amount: null };
    rows.set(key, row);
    if (Number(x) > 480 && MONEY.test(text)) row.amount = text;
    else row.text.push([Number(x), text]);
  }
  if (opening === undefined || closing === undefined || !endYear) {
    throw new Error("That doesn't look like an Afterpay statement.");
  }

  const out: Row[] = [];
  for (const key of [...rows.keys()].sort()) {
    const r = rows.get(key)!;
    const line = r.text.sort((a, b) => a[0] - b[0]).map(([, t]) => t).join(" ");
    const m = /^(\d\d)\/(\d\d) (\S+(?: Below)?) (.+)$/.exec(line);
    if (!m) continue; // headers, the address, "1 of 4", and a bundle's parts (no date)
    const [, dd, mm, order] = m;
    let desc = m[4];
    let amount = r.amount;
    const inline = /^(.*) (\+?\$[\d,]+\.\d\d)$/.exec(desc);
    if (!amount && inline) [, desc, amount] = inline;
    if (!amount) continue; // a refund still pending has no amount yet
    const date = `${Number(mm) > endMonth ? endYear - 1 : endYear}-${mm}-${dd}`;
    const value = cents(amount);
    // "HOTELCOM73465381394476" → "HOTELCOM", so every booking is one shop.
    const shop = (s: string) => s.replace(/\d{6,}$/, "").trim();
    if (desc.startsWith("Order from ")) out.push({ date, cents: -value, description: shop(desc.slice(11)), order });
    else if (desc.startsWith("Refund from ")) out.push({ date, cents: value, description: shop(desc.slice(12)), order: null });
    else if (desc.startsWith("Late fee")) out.push({ date, cents: -value, description: "Afterpay late fee", order: null });
    else if (/^(Bundled )?Payment/.test(desc)) out.push({ date, cents: value, description: PAYMENT, order: null });
    else throw new Error(`Unknown statement line: ${line} ${amount}`);
  }
  const net = out.reduce((s, r) => s + r.cents, 0);
  if (-opening + net !== -closing) {
    throw new Error(`Rows don't add up to the closing balance (${(-opening + net) / 100} vs ${-closing / 100}).`);
  }
  return { opening, closing, rows: out };
}

/**
 * Every statement's rows, oldest first. An order made on a statement's last
 * day shows again on the next one, so each order number is kept once.
 * bankCharges are the Afterpay charges from the bank account (positive
 * cents); a charge with no repayment on the statements (Afterpay Plus, which
 * the statements leave out) becomes that repayment and the fee.
 */
export function combine(statements: Statement[], bankCharges: { date: string; cents: number }[] = []): Row[] {
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const s of statements) {
    for (const r of s.rows) {
      if (r.order && seen.has(r.order)) continue;
      if (r.order) seen.add(r.order);
      rows.push(r);
    }
  }
  if (rows.length) {
    const first = rows.reduce((d, r) => (r.date < d ? r.date : d), rows[0].date);
    const unmatched = rows.filter((r) => r.description === PAYMENT);
    // The bank takes up to a few days to show a payment.
    const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;
    for (const charge of bankCharges.filter((c) => c.date >= first)) {
      const i = unmatched.findIndex((p) => p.cents === charge.cents && days(p.date, charge.date) >= 0 && days(p.date, charge.date) <= 4);
      if (i >= 0) unmatched.splice(i, 1);
      else rows.push({ ...charge, description: PAYMENT, order: null }, { ...charge, cents: -charge.cents, description: PLUS, order: null });
    }
  }
  // Stable: rows keep their statement order within a day.
  return rows.map((r, i) => [r, i] as const).sort(([a, i], [b, j]) => a.date.localeCompare(b.date) || i - j).map(([r]) => r);
}

/** The rows as a NetBank-style CSV (date, amount, description, balance after). */
export function toCsv(rows: Row[], openingOwed: number): string {
  let balance = -openingOwed;
  const money = (c: number) => `${c < 0 ? "-" : "+"}${(Math.abs(c) / 100).toFixed(2)}`;
  return rows
    .map((r) => {
      balance += r.cents;
      const [y, m, d] = r.date.split("-");
      return [`${d}/${m}/${y}`, money(r.cents), r.description.replaceAll('"', '""'), money(balance)].map((f) => `"${f}"`).join(",");
    })
    .join("\n");
}
