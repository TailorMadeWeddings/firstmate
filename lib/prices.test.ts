import assert from "node:assert/strict";
import { test } from "node:test";
import { fromAldi, fromColes, fromHarrisFarm, fromWoolworths, mainUnit, matches, perUnit, sizeOf, unflatten, unitMoney } from "./prices.ts";

test("prices: sizes come out in kg, L or each, whatever the store writes", () => {
  assert.deepEqual(sizeOf("Full Cream Milk 2L"), { unit: "l", qty: 2, text: "2L" });
  assert.deepEqual(sizeOf("100G"), { unit: "kg", qty: 0.1, text: "100G" });
  assert.deepEqual(sizeOf("Coca-Cola 24 x 375mL"), { unit: "l", qty: 9, text: "24 x 375mL" });
  assert.deepEqual(sizeOf("Cavendish Bananas per kg"), { unit: "kg", qty: 1, text: "1 kg" });
  assert.deepEqual(sizeOf("Cavendish Bananas each"), { unit: "each", qty: 1, text: "each" });
  assert.equal(sizeOf("$1.70 per 1 L")?.qty, 1);
  assert.equal(sizeOf("Eggs"), null);
  assert.equal(sizeOf(null), null);
  assert.deepEqual(perUnit(4.95, "3L"), { unit_price: 1.65, unit: "l" });
  assert.deepEqual(perUnit(3.13, "100g"), { unit_price: 31.3, unit: "kg" });
  assert.deepEqual(perUnit(5, "a bag"), { unit_price: null, unit: null });
  assert.equal(unitMoney(1.65, "l"), "$1.65/L");
  assert.equal(unitMoney(250, "kg"), "$25.00/100 g");
});

test("prices: a product matches when its name has every word searched for", () => {
  assert.ok(matches("full cream milk", "Coles Full Cream Milk 3L"));
  assert.ok(!matches("full cream milk", "Milk Mouse - Milk Chocolate 168g"));
  assert.equal(mainUnit([{ unit: "l" }, { unit: "kg" }, { unit: "l" }, { unit: null }]), "l");
  assert.equal(mainUnit([{ unit: null }]), null);
});

test("prices: Woolworths' API, with its cup price", () => {
  const got = fromWoolworths({
    Products: [
      { Products: [{ Stockcode: 888140, DisplayName: "Woolworths Full Cream Milk 3L", PackageSize: "3L", Price: 4.95, WasPrice: 4.95, CupPrice: 1.65, CupMeasure: "1L" }] },
      { Products: [{ Stockcode: 1, DisplayName: "Unavailable", Price: null }, { Stockcode: 133211, DisplayName: "Cavendish Bananas each", PackageSize: "each", Price: 0.81, WasPrice: 1.2 }] },
    ],
  });
  assert.deepEqual(got, [
    { store: "woolworths", product_id: "888140", product: "Woolworths Full Cream Milk 3L", size: "3L", price: 4.95, was_price: null, unit_price: 1.65, unit: "l" },
    { store: "woolworths", product_id: "133211", product: "Cavendish Bananas each", size: "each", price: 0.81, was_price: 1.2, unit_price: 0.81, unit: "each" },
  ]);
});

test("prices: Coles' page data, ads skipped, unit price from what it shows shoppers", () => {
  const data = {
    props: { pageProps: { searchResults: { results: [
      { _type: "SINGLE_TILE" },
      { _type: "PRODUCT", id: 409499, brand: "Coles", name: "Bananas", size: "approx. 170g", pricing: { now: 0.83, was: 0, comparable: "$4.90/ 1kg" } },
      { _type: "PRODUCT", id: 1913790, brand: "Devondale", name: "Full Cream Milk", size: "2L", pricing: { now: 4.2, was: 4.7, comparable: "$2.10/ 1L" } },
    ] } } },
  };
  const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`;
  assert.deepEqual(fromColes(html), [
    { store: "coles", product_id: "409499", product: "Coles Bananas approx. 170g", size: "approx. 170g", price: 0.83, was_price: null, unit_price: 4.9, unit: "kg" },
    { store: "coles", product_id: "1913790", product: "Devondale Full Cream Milk 2L", size: "2L", price: 4.2, was_price: 4.7, unit_price: 2.1, unit: "l" },
  ]);
  assert.throws(() => fromColes("<title>Pardon Our Interruption</title>"), /bot check/);
});

test("prices: Aldi's Nuxt data, followed back through its indexes", () => {
  // [root, products list, product, its price, …values]: how Nuxt flattens it.
  const flat = [
    { products: 1 },
    ["ShallowReactive", 2],
    [3, 9],
    { sku: 4, name: 5, brandName: 6, sellingSize: 7, price: 8 },
    "000000000000398689", "Full Cream Milk 2L", "FARMDALE", "2 l",
    { amountRelevant: 15, comparison: 16, comparisonDisplay: 17 },
    { sku: 10, name: 11, brandName: -1, sellingSize: -1, price: 12 },
    "000000000000380234", "Cavendish Bananas per kg",
    { amountRelevant: 18, comparison: -1, comparisonDisplay: -1 },
    0, 0,
    339, 170, "$1.70 per 1 L", 449,
  ];
  assert.deepEqual((unflatten(flat) as { products: { sku: string }[] }).products.map((p) => p.sku), ["000000000000398689", "000000000000380234"]);
  const html = `<script type="application/json" data-ssr="true" id="__NUXT_DATA__">${JSON.stringify(flat)}</script>`;
  assert.deepEqual(fromAldi(html), [
    { store: "aldi", product_id: "398689", product: "FARMDALE Full Cream Milk 2L", size: "2 l", price: 3.39, was_price: null, unit_price: 1.7, unit: "l" },
    { store: "aldi", product_id: "380234", product: "Cavendish Bananas per kg", size: null, price: 4.49, was_price: null, unit_price: 4.49, unit: "kg" },
  ]);
});

test("prices: Harris Farm's suggestions, sized from the title", () => {
  const got = fromHarrisFarm({
    resources: { results: { products: [
      { id: 5044171210811, title: "Norco Full Cream Milk 3L", price: "6.00", compare_at_price_min: "0.00", available: true },
      { id: 2, title: "Sold out milk 1L", price: "2.00", available: false },
    ] } },
  });
  assert.deepEqual(got, [{ store: "harris_farm", product_id: "5044171210811", product: "Norco Full Cream Milk 3L", size: "3L", price: 6, was_price: null, unit_price: 2, unit: "l" }]);
});
