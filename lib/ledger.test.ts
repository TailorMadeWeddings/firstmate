import assert from "node:assert/strict";
import { test } from "node:test";
import { type Category, forEntry, parseAmount, signed } from "./ledger.ts";

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
