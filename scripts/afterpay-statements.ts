// Afterpay statements (PDFs) into one CSV for the Ledger's importer.
//   node scripts/afterpay-statements.ts <folder of statement PDFs> [NetBank CSV] > afterpay.csv
// Converts every statement in the folder each time; importing the result
// skips rows already in the Ledger, so keep all the statements together.
// With the bank account's CSV, Afterpay charges that aren't on any
// statement (the Afterpay Plus fee) come in as well.
// Then: Ledger → Import a CommBank CSV, into the Afterpay account (type
// credit, opening balance minus what was owed at the first statement).
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { combine, parseStatement, toCsv } from "../lib/afterpay.ts";
import { parseCommBankCsv } from "../lib/ledger.ts";

const [folder, bank] = process.argv.slice(2);
if (!folder) throw new Error("Usage: afterpay-statements.ts <statements folder> [NetBank CSV]");

// ponytail: macOS's PDFKit reads the PDFs, so no PDF package; each text line
// with its position, as page|y|x|text.
const LINES = `function run(argv) {
  ObjC.import("PDFKit");
  const doc = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(argv[0]));
  const out = [];
  for (let p = 0; p < doc.pageCount; p++) {
    const page = doc.pageAtIndex(p);
    const box = page.boundsForBox($.kPDFDisplayBoxMediaBox);
    const lines = page.selectionForRect(box).selectionsByLine;
    for (let i = 0; i < lines.count; i++) {
      const sel = lines.objectAtIndex(i);
      const b = sel.boundsForPage(page);
      const text = sel.string.js.replace(/\\s+/g, " ").trim();
      if (text) out.push([p, Math.round(box.size.height - b.origin.y - b.size.height), Math.round(b.origin.x), text].join("|"));
    }
  }
  return out.join("\\n");
}`;

const files = readdirSync(folder).filter((f) => f.toLowerCase().endsWith(".pdf")).sort();
const statements = files.map((f) => {
  try {
    return parseStatement(execFileSync("osascript", ["-l", "JavaScript", "-e", LINES, join(folder, f)], { encoding: "utf8" }));
  } catch (e) {
    throw new Error(`${f}: ${(e as Error).message}`);
  }
});
// Oldest first, by the first row's date (file names may not sort that way).
statements.sort((a, b) => (a.rows[0]?.date ?? "").localeCompare(b.rows[0]?.date ?? ""));

let charges: { date: string; cents: number }[] = [];
if (bank) {
  const rows = parseCommBankCsv(readFileSync(bank, "utf8"));
  if (typeof rows === "string") throw new Error(`${bank}: ${rows}`);
  charges = rows
    .filter((r) => /^afterpay/i.test(r.description) && Number(r.amount) < 0)
    .map((r) => ({ date: r.date, cents: -Math.round(Number(r.amount) * 100) }));
}

const rows = combine(statements, charges);
process.stdout.write(toCsv(rows, statements[0].opening) + "\n");
const owed = statements.at(-1)!.closing / 100;
console.error(
  `${files.length} statements, ${rows.length} rows. Opening balance for the account: -${(statements[0].opening / 100).toFixed(2)}; ` +
    `it should end at -${owed.toFixed(2)}.`,
);
