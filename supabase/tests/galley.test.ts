// The Galley: crew read the household's recipes and add their own; Owners
// change any, Trusted members only theirs; Guests see none. Setup lives in db.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Transaction } from "@electric-sql/pglite";
import { GUEST, HOME, OTHER_OWNER, OUTSIDER, OWNER, TRUSTED, as, count, setup } from "./db.ts";

const save = (tx: Transaction, opts: { recipe?: string; title?: string; tags?: string[]; ingredients?: object[] } = {}) =>
  tx
    .query<{ id: string }>(
      `select galley_save_recipe($1, $2, $3, 'Weeknight staple', null, 4, 10, 20, $4::jsonb, $5::jsonb, $6) as id`,
      [
        opts.recipe ?? null,
        HOME,
        opts.title ?? "Spaghetti bolognese",
        JSON.stringify(opts.ingredients ?? [
          { quantity: 500, unit: "g", name: "beef mince" },
          { quantity: 1, unit: null, name: "onion", notes: "finely chopped" },
        ]),
        JSON.stringify([{ instruction: "Brown the mince." }, { instruction: "Simmer.", duration_seconds: 1200 }]),
        opts.tags ?? ["Quick", "kid-friendly", "quick"],
      ],
    )
    .then((r) => r.rows[0].id);

test("galley: a recipe saves with its parts, in order, and edits replace them", async () => {
  const db = await setup();
  const got = await as(db, OWNER, async (tx) => {
    const id = await save(tx);
    const parts = {
      ingredients: (await tx.query("select position, quantity::text, unit, name, notes from recipe_ingredients order by position")).rows,
      steps: (await tx.query("select position, instruction, duration_seconds from recipe_steps order by position")).rows,
      tags: (await tx.query("select tag from recipe_tags order by tag")).rows.map((r) => (r as { tag: string }).tag),
    };
    await save(tx, { recipe: id, title: "Spag bol", tags: [], ingredients: [{ quantity: null, unit: null, name: "salt" }] });
    const after = {
      title: (await tx.query<{ title: string }>("select title from recipes")).rows[0].title,
      ingredients: await count(tx, "recipe_ingredients"),
      tags: await count(tx, "recipe_tags"),
    };
    return { parts, after };
  });
  assert.deepEqual(got.parts.ingredients, [
    { position: 1, quantity: "500.000", unit: "g", name: "beef mince", notes: null },
    { position: 2, quantity: "1.000", unit: null, name: "onion", notes: "finely chopped" },
  ]);
  assert.deepEqual(got.parts.steps, [
    { position: 1, instruction: "Brown the mince.", duration_seconds: null },
    { position: 2, instruction: "Simmer.", duration_seconds: 1200 },
  ]);
  assert.deepEqual(got.parts.tags, ["kid-friendly", "quick"]);
  assert.deepEqual(got.after, { title: "Spag bol", ingredients: 1, tags: 0 });
});

test("galley: crew read; guests and outsiders don't; trusted can't change the owner's recipes", async () => {
  const db = await setup();
  await db.exec(`insert into recipes (id, household_id, title, created_by) values
    ('80000000-0000-0000-0000-000000000001', '${HOME}', 'Pavlova', '${OWNER}')`);
  await db.exec(`insert into recipe_ingredients (recipe_id, position, name) values ('80000000-0000-0000-0000-000000000001', 1, 'egg whites')`);
  for (const [who, sees] of [
    [OWNER, 1],
    [TRUSTED, 1],
    [GUEST, 0],
    [OUTSIDER, 0],
    [OTHER_OWNER, 0],
    [null, 0],
  ] as const) {
    assert.equal(await as(db, who, (tx) => count(tx, "recipes")), sees, `recipes ${who}`);
    assert.equal(await as(db, who, (tx) => count(tx, "recipe_ingredients")), sees, `ingredients ${who}`);
  }
  // Trusted members add their own…
  assert.ok(await as(db, TRUSTED, (tx) => save(tx)));
  // …but can't change or take apart the owner's.
  await assert.rejects(
    as(db, TRUSTED, (tx) => save(tx, { recipe: "80000000-0000-0000-0000-000000000001" })),
    /recipe not found/,
  );
  const removed = await as(db, TRUSTED, async (tx) => {
    const a = await tx.query("delete from recipe_ingredients");
    const b = await tx.query("delete from recipes");
    return (a.affectedRows ?? 0) + (b.affectedRows ?? 0);
  });
  assert.equal(removed, 0);
  await assert.rejects(as(db, GUEST, (tx) => save(tx)), /row-level security/);
});

test("galley: constraints", async () => {
  const db = await setup();
  const run = (sql: string) => as(db, OWNER, (tx) => tx.query(sql));
  await assert.rejects(as(db, OWNER, (tx) => save(tx, { title: "   " })), /check constraint/);
  await assert.rejects(
    as(db, OWNER, (tx) => save(tx, { ingredients: [{ quantity: -1, name: "flour" }] })),
    /check constraint/,
  );
  await assert.rejects(
    run(`insert into recipes (household_id, title, source_url, created_by) values ('${HOME}', 'X', 'javascript:alert(1)', '${OWNER}')`),
    /check constraint/,
  );
  // Deleting a recipe takes its parts with it.
  const left = await as(db, OWNER, async (tx) => {
    await save(tx);
    await tx.query("delete from recipes");
    return (await count(tx, "recipe_ingredients")) + (await count(tx, "recipe_steps")) + (await count(tx, "recipe_tags"));
  });
  assert.equal(left, 0);
});
