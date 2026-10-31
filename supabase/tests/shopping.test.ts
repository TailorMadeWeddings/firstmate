// The Galley's shopping list: the crew share it, Guests and next door see
// nothing, and items only point at the household's own recipes.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Transaction } from "@electric-sql/pglite";
import { GUEST, HOME, OTHER_HOME, OTHER_OWNER, OUTSIDER, OWNER, TRUSTED, as, count, setup } from "./db.ts";

const PIE = "80000000-0000-0000-0000-000000000001";
const NEIGHBOURS_PIE = "80000000-0000-0000-0000-000000000002";

async function shopping() {
  const db = await setup();
  await db.exec(`
    insert into recipes (id, household_id, title, created_by) values
      ('${PIE}', '${HOME}', 'Pie', '${OWNER}'), ('${NEIGHBOURS_PIE}', '${OTHER_HOME}', 'Pie', '${OTHER_OWNER}');
    insert into shopping_items (household_id, name, recipe_id, added_by) values ('${HOME}', '2 lemons', '${PIE}', '${OWNER}');
  `);
  return db;
}

const add = (recipe: string | null = null) => (tx: Transaction) =>
  tx.query(`insert into shopping_items (household_id, name, recipe_id) values ($1, 'Milk', $2)`, [HOME, recipe]);

test("shopping: the crew share the list; Guests, outsiders and next door don't", async () => {
  const db = await shopping();
  for (const [who, sees] of [
    [OWNER, 1],
    [TRUSTED, 1],
    [GUEST, 0],
    [OUTSIDER, 0],
    [OTHER_OWNER, 0],
    [null, 0],
  ] as const) {
    assert.equal(await as(db, who, (tx) => count(tx, "shopping_items")), sees, `items seen by ${who}`);
  }
  await assert.rejects(as(db, GUEST, add()), /row-level security/);
  await assert.rejects(as(db, OTHER_OWNER, add()), /row-level security/);
});

test("shopping: anyone in the crew adds, ticks off and clears; recipes must be ours", async () => {
  const db = await shopping();
  await assert.rejects(as(db, TRUSTED, add(NEIGHBOURS_PIE)), /row-level security/);
  assert.equal(await as(db, OTHER_OWNER, (tx) => tx.query(`delete from shopping_items`).then((r) => r.affectedRows)), 0);
  const cleared = await as(db, TRUSTED, async (tx) => {
    await add(PIE)(tx);
    await tx.query(`update shopping_items set checked_at = now()`);
    return (await tx.query(`delete from shopping_items where checked_at is not null`)).affectedRows;
  });
  assert.equal(cleared, 2);
});

const plan = (recipe: string | null, day = "2026-11-02") => (tx: Transaction) =>
  tx.query(`insert into meal_plans (household_id, day, meal, title, recipe_id) values ($1, $2, 'dinner', 'Pie', $3)`, [HOME, day, recipe]);

test("meal plan: the crew plan lunch and dinner, one of each a day, with our own recipes", async () => {
  const db = await shopping();
  assert.equal(await as(db, TRUSTED, async (tx) => {
    await plan(PIE)(tx);
    await plan(null, "2026-11-03")(tx);
    return count(tx, "meal_plans");
  }), 2);
  await assert.rejects(as(db, TRUSTED, async (tx) => {
    await plan(PIE)(tx);
    await plan(null)(tx);
  }), /duplicate key/);
  await assert.rejects(as(db, TRUSTED, plan(NEIGHBOURS_PIE)), /row-level security/);
  await assert.rejects(as(db, GUEST, plan(null)), /row-level security/);
  await assert.rejects(as(db, OTHER_OWNER, plan(null)), /row-level security/);
});
