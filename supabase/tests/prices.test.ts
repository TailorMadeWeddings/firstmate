// Grocery prices: the crew read them and choose what to follow; only the
// server (the secret key, which skips row-level security) writes prices.
// Setup lives in db.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { GUEST, HOME, OTHER_OWNER, OWNER, TRUSTED, as, count, setup } from "./db.ts";

const ITEM = "60000000-0000-0000-0000-000000000001";

async function withPrices() {
  const db = await setup();
  // As the server would: straight in, no role.
  await db.exec(`
    insert into price_items (id, household_id, name, search, created_by) values ('${ITEM}', '${HOME}', 'Full cream milk', 'full cream milk', '${TRUSTED}');
    insert into prices (household_id, item_id, store, product_id, product, price, unit_price, unit, seen_on, source) values
      ('${HOME}', '${ITEM}', 'coles', '1', 'Coles Full Cream Milk 3L', 4.95, 1.65, 'l', current_date, 'pull'),
      ('${HOME}', '${ITEM}', 'coles', '2', 'Devondale Full Cream Milk 2L', 4.20, 2.10, 'l', current_date, 'pull'),
      ('${HOME}', '${ITEM}', 'coles', '1', 'Coles Full Cream Milk 3L', 4.50, 1.50, 'l', current_date - 7, 'pull'),
      ('${HOME}', '${ITEM}', 'coles', '1', 'Coles Full Cream Milk 3L', 5.40, 1.80, 'l', current_date - 14, 'pull'),
      ('${HOME}', '${ITEM}', 'costco', '12345', 'KS MILK 2X3L', 8.99, 1.4983, 'l', current_date - 3, 'receipt'),
      ('${HOME}', '${ITEM}', 'aldi', '9', 'Milk chocolate 168g', 3.99, 23.75, 'kg', current_date, 'pull');
  `);
  return db;
}

test("prices: the crew read them; guests and next door don't", async () => {
  const db = await withPrices();
  assert.equal(await as(db, TRUSTED, (tx) => count(tx, "prices")), 6);
  assert.equal(await as(db, GUEST, (tx) => count(tx, "prices")), 0);
  assert.equal(await as(db, GUEST, (tx) => count(tx, "price_items")), 0);
  assert.equal(await as(db, OTHER_OWNER, (tx) => count(tx, "price_summary")), 0);
});

test("prices: only the server writes prices", async () => {
  const db = await withPrices();
  await assert.rejects(
    as(db, OWNER, (tx) => tx.query(`insert into prices (household_id, item_id, store, product_id, product, price, seen_on, source) values ('${HOME}', '${ITEM}', 'coles', 'x', 'x', 1, current_date, 'pull')`)),
  );
  // One product, one store, one day: a second sighting is the same row.
  await assert.rejects(
    db.exec(`insert into prices (household_id, item_id, store, product_id, product, price, seen_on, source) values ('${HOME}', '${ITEM}', 'coles', '1', 'again', 4, current_date, 'pull')`),
  );
});

test("prices: crew follow ingredients; Owners or whoever added one stop following", async () => {
  const db = await withPrices();
  await as(db, TRUSTED, async (tx) => {
    await tx.query(`insert into price_items (household_id, name, search) values ($1, 'Eggs', 'free range eggs 12')`, [HOME]);
    await assert.rejects(tx.query(`insert into price_items (household_id, name, search) values ($1, 'EGGS', 'eggs')`, [HOME]), /price_items_name/);
  });
  await assert.rejects(as(db, GUEST, (tx) => tx.query(`insert into price_items (household_id, name, search) values ($1, 'Eggs', 'eggs')`, [HOME])));
  const stopped = async (user: string) =>
    as(db, user, async (tx) => {
      await tx.query(`delete from price_items where id = $1`, [ITEM]);
      return { items: await count(tx, "price_items"), prices: await count(tx, "prices") };
    });
  assert.deepEqual(await stopped(OWNER), { items: 0, prices: 0 });
  assert.deepEqual(await stopped(TRUSTED), { items: 0, prices: 0 });
  // Another trusted member's ingredient stays.
  await db.exec(`update price_items set created_by = '${OWNER}'`);
  assert.deepEqual(await stopped(TRUSTED), { items: 1, prices: 6 });
});

test("prices: the summary has each store's usual, lowest and latest, per unit", async () => {
  const db = await withPrices();
  const got = await as(db, TRUSTED, async (tx) =>
    (await tx.query(`select store, unit, usual::float, lowest::float, days, product, price::float, seen_on = current_date as today from price_summary order by store, unit`)).rows,
  );
  assert.deepEqual(got, [
    { store: "aldi", unit: "kg", usual: 23.75, lowest: 23.75, days: 1, product: "Milk chocolate 168g", price: 3.99, today: true },
    // Today's cheapest per litre is the latest; usual is the median of every sighting.
    { store: "coles", unit: "l", usual: 1.725, lowest: 1.5, days: 3, product: "Coles Full Cream Milk 3L", price: 4.95, today: true },
    { store: "costco", unit: "l", usual: 1.4983, lowest: 1.4983, days: 1, product: "KS MILK 2X3L", price: 8.99, today: false },
  ]);
});
