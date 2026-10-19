import assert from "node:assert/strict";
import { test } from "node:test";
import { type Category, type Imported, forEntry, notYetSaved, parseAmount, parseCommBankCsv, signed } from "./ledger.ts";

test("amounts parse exactly, and only sensible ones", () => {
  assert.equal(parseAmount("12"), "12");
  assert.equal(parseAmount(" $1,234.50 "), "1234.50");
  assert.equal(parseAmount("0.1"), "0.1");
  for (const bad of ["", "abc", "1.234", "-5", "0", "1e5", "12345678901"]) {
    assert.equal(parseAmount(bad), null, bad);
  }
  assert.equal(parseAmount("-250.00", true), "-250.00");
  assert.equal(parseAmount("0", true), "0");
  assert.equal(signed("84.20", "expense"), "-84.20");
  assert.equal(signed("1500", "income"), "1500");
});

test("entry forms list recent categories first and hide archived ones", () => {
  const c = (id: string, name: string, extra: Partial<Category> = {}): Category => ({
    id, name, type: "expense", parent_category_id: null, archived_at: null, color: null, icon: null, ...extra,
  });
  const all = [
    c("t", "Transport"),
    c("f", "Fuel", { parent_category_id: "t" }),
    c("g", "Groceries"),
    c("a", "Alcohol", { archived_at: "2026-10-01" }),
    c("e", "Eating Out"),
  ];
  const names = forEntry(all, ["g", null, "f", "g"]).map((x) => x.id);
  assert.deepEqual(names, ["g", "f", "e", "t"]);
});

test("CommBank CSVs parse, and bad ones say which line", () => {
  const csv =
    '﻿19/10/2026,"-12.50","WOOLWORTHS 1234  SYDNEY AU","+1,234.56"\r\n' +
    '1/9/2026,"+1,500.00","Salary, ACME ""PTY"" LTD","+1,247.06"\r\n' +
    '2/9/2026,"0.00","Interest","+1,247.06"\r\n\r\n';
  assert.deepEqual(parseCommBankCsv(csv), [
    { date: "2026-10-19", amount: "-12.50", description: "WOOLWORTHS 1234 SYDNEY AU" },
    { date: "2026-09-01", amount: "1500.00", description: 'Salary, ACME "PTY" LTD' },
  ]);
  assert.equal((parseCommBankCsv("Date,Amount,Description,Balance\n" + csv) as Imported[]).length, 2);
  assert.match(parseCommBankCsv(csv + "oops,1,x,1") as string, /^Line 5/);
  assert.match(parseCommBankCsv('31/02/2026,"-1.00","x","0"') as string, /impossible date/);
  assert.match(parseCommBankCsv('1/13/2026,"-1.00","x","0"') as string, /impossible date/);
  assert.match(parseCommBankCsv('1/2/2026,"lots","x","0"') as string, /amount/);
  assert.equal(parseCommBankCsv(""), "That file has no transactions in it.");
});

test("re-importing skips rows already saved, counting duplicates", () => {
  const coffee = { date: "2026-10-19", amount: "-5.00", description: "CAFE" };
  const rows = [coffee, coffee, { ...coffee, amount: "-6.00" }];
  const saved = [{ date: "2026-10-19", amount: -5, description: "CAFE" }];
  assert.deepEqual(notYetSaved(rows, saved), [coffee, { ...coffee, amount: "-6.00" }]);
  assert.deepEqual(notYetSaved(rows, [...saved, ...saved, { ...saved[0], amount: -6 }]), []);
});
