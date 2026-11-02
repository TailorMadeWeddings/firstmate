import assert from "node:assert/strict";
import { test } from "node:test";
import { PAYMENT, PLUS, combine, parseStatement, toCsv } from "./afterpay.ts";

// page|y|x|text, as PDFKit reads a statement: an amount sometimes on its own
// line at the right, sometimes inside the row's text.
const december = [
  "0|67|463|21 Dec - 20 Jan 2027",
  "0|100|500|Opening balance $100.00",
  "0|112|500|Closing balance $150.00",
  "0|300|56|28/12 900000001 Order from NXT*Golf Shop $80.00",
  "0|340|56|28/12 900000001 Payment: NXT*Golf Shop order",
  "0|340|528|+$20.00",
  "0|352|248|1 of 4",
  "0|380|56|02/01 See Below Bundled Payment +$30.00",
  "0|400|248|800000001 Payment 2 of 4 +$30.00",
  "1|200|56|05/01 800000002 Late fee",
  "1|200|530|$10.00",
  "1|240|56|06/01 800000002 Payment +$10.00",
  "1|280|56|20/01 900000002 Order from HOTELCOM73465381394476 $20.00",
].join("\n");
const january = [
  "0|67|463|21 Jan - 20 Feb 2027",
  "0|100|500|Opening balance $130.00",
  "0|112|500|Closing balance $90.00",
  "0|300|56|21/01 900000002 Order from HOTELCOM73465381394476 $20.00",
  "0|340|56|22/01 900000002 Refund from HOTELCOM73465381394476 +$20.00",
  "0|380|56|30/01 See Below Bundled Payment +$40.00",
].join("\n");

test("afterpay: statements into rows, each order once", () => {
  const dec = parseStatement(december);
  assert.deepEqual(dec.rows, [
    { date: "2026-12-28", cents: -8000, description: "NXT*Golf Shop", order: "900000001" },
    { date: "2026-12-28", cents: 2000, description: PAYMENT, order: null },
    { date: "2027-01-02", cents: 3000, description: PAYMENT, order: null },
    { date: "2027-01-05", cents: -1000, description: "Afterpay late fee", order: null },
    { date: "2027-01-06", cents: 1000, description: PAYMENT, order: null },
    { date: "2027-01-20", cents: -2000, description: "HOTELCOM", order: "900000002" },
  ]);
  // The hotel order is on both statements; the bank charged a $9.99 that no statement shows.
  const rows = combine([dec, parseStatement(january)], [
    { date: "2026-12-29", cents: 2000 },
    { date: "2027-01-14", cents: 999 },
  ]);
  assert.equal(rows.filter((r) => r.order === "900000002").length, 1);
  assert.deepEqual(rows.filter((r) => r.date === "2027-01-14").map((r) => [r.description, r.cents]), [[PAYMENT, 999], [PLUS, -999]]);
  const csv = toCsv(rows, dec.opening).split("\n");
  assert.equal(csv[0], '"28/12/2026","-80.00","NXT*Golf Shop","-180.00"');
  // Ends at what the last statement says is owed.
  assert.equal(csv.at(-1)!.split(",")[3], '"-90.00"');
});

test("afterpay: a statement that doesn't add up is refused", () => {
  assert.throws(() => parseStatement(december.replace("Closing balance $150.00", "Closing balance $151.00")), /closing balance/);
  assert.throws(() => parseStatement("0|1|1|Hello"), /Afterpay statement/);
});
