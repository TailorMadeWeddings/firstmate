// Galley collections and sharing (KID-22): Guests see only what's shared
// with them, contributors add to it, revoking works at once. Also the
// cooking log and recipe photos. Setup lives in db.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { GUEST, HOME, OTHER_OWNER, OUTSIDER, OWNER, TRUSTED, as, count, setup } from "./db.ts";

const SHARED = "80000000-0000-0000-0000-000000000001";
const PRIVATE = "80000000-0000-0000-0000-000000000002";
const ROASTS = "90000000-0000-0000-0000-000000000001";
const SECRET = "90000000-0000-0000-0000-000000000002";

/** Two recipes, one filed in "Sunday roasts"; a second, empty collection. */
async function galley(): Promise<PGlite> {
  const db = await setup();
  await db.exec(`
    insert into recipes (id, household_id, title, created_by) values
      ('${SHARED}', '${HOME}', 'Roast lamb', '${OWNER}'), ('${PRIVATE}', '${HOME}', 'Birthday cake', '${OWNER}');
    insert into recipe_ingredients (recipe_id, position, name) values ('${SHARED}', 1, 'lamb'), ('${PRIVATE}', 1, 'flour');
    insert into recipe_collections (id, household_id, name, created_by) values
      ('${ROASTS}', '${HOME}', 'Sunday roasts', '${OWNER}'), ('${SECRET}', '${HOME}', 'Surprises', '${OWNER}');
    insert into collection_recipes (collection_id, recipe_id, added_by) values ('${ROASTS}', '${SHARED}', '${OWNER}');
  `);
  return db;
}

/** The Owner shares "Sunday roasts" (checked through row-level security, then kept, since as() rolls back). */
async function share(db: PGlite, who: string, permission = "read") {
  const sql = `insert into collection_shares (collection_id, profile_id, permission) values ($1, $2, $3)`;
  await as(db, OWNER, (tx) => tx.query(sql, [ROASTS, who, permission]));
  await db.query(sql, [ROASTS, who, permission]);
}

const titles = (tx: Transaction) => tx.query<{ title: string }>("select title from recipes order by title").then((r) => r.rows.map((x) => x.title));

const saveInto = (tx: Transaction, collection: string | null) =>
  tx
    .query<{ id: string }>(
      `select galley_save_recipe(null, $1, 'Gravy', null, null, 4, null, null, '[{"name":"stock"}]'::jsonb, '[]'::jsonb, '{}', $2) as id`,
      [HOME, collection],
    )
    .then((r) => r.rows[0].id);

test("galley sharing: a Guest sees only the shared collection, and revoking works at once", async () => {
  const db = await galley();
  assert.deepEqual(await as(db, GUEST, titles), []);
  assert.deepEqual(await as(db, TRUSTED, titles), ["Birthday cake", "Roast lamb"]);

  await share(db, GUEST);
  const seen = await as(db, GUEST, async (tx) => ({
    recipes: await titles(tx),
    ingredients: await count(tx, "recipe_ingredients"),
    collections: (await tx.query<{ name: string }>("select name from recipe_collections")).rows.map((r) => r.name),
    shares: await count(tx, "collection_shares"),
  }));
  assert.deepEqual(seen, { recipes: ["Roast lamb"], ingredients: 1, collections: ["Sunday roasts"], shares: 1 });

  // Read-only: no new recipes, no filing, no resharing, no edits.
  await assert.rejects(as(db, GUEST, (tx) => saveInto(tx, ROASTS)), /row-level security/);
  await assert.rejects(
    as(db, GUEST, (tx) => tx.query(`insert into collection_shares (collection_id, profile_id) values ('${ROASTS}', '${TRUSTED}')`)),
    /row-level security/,
  );
  assert.equal(await as(db, GUEST, (tx) => tx.query(`update recipes set title = 'Mine'`).then((r) => r.affectedRows)), 0);

  await db.exec(`delete from collection_shares`);
  assert.deepEqual(await as(db, GUEST, titles), []);
  assert.equal(await as(db, GUEST, (tx) => count(tx, "recipe_collections")), 0);
});

test("galley sharing: contributors add recipes to the collection, and only to it", async () => {
  const db = await galley();
  await share(db, GUEST, "contribute");
  const after = await as(db, GUEST, async (tx) => {
    const id = await saveInto(tx, ROASTS);
    // They can change what they wrote…
    const own = (await tx.query(`update recipes set title = 'Onion gravy' where id = $1`, [id])).affectedRows;
    // …but not the Owner's recipe.
    const owners = (await tx.query(`update recipes set title = 'Mine' where id = '${SHARED}'`)).affectedRows;
    return { titles: await titles(tx), filed: await count(tx, "collection_recipes"), own, owners };
  });
  assert.deepEqual(after, { titles: ["Onion gravy", "Roast lamb"], filed: 2, own: 1, owners: 0 });

  // Not into collections they don't contribute to, and not recipes they can't see.
  await assert.rejects(as(db, GUEST, (tx) => saveInto(tx, SECRET)), /row-level security/);
  await assert.rejects(
    as(db, GUEST, (tx) => tx.query(`insert into collection_recipes (collection_id, recipe_id) values ('${ROASTS}', '${PRIVATE}')`)),
    /row-level security/,
  );
});

test("galley sharing: only Owners make collections and share them, within the household", async () => {
  const db = await galley();
  await assert.rejects(
    as(db, TRUSTED, (tx) => tx.query(`insert into recipe_collections (household_id, name) values ('${HOME}', 'Mine')`)),
    /row-level security/,
  );
  await assert.rejects(
    as(db, TRUSTED, (tx) => tx.query(`insert into collection_shares (collection_id, profile_id) values ('${ROASTS}', '${GUEST}')`)),
    /row-level security/,
  );
  for (const who of [OUTSIDER, OTHER_OWNER, OWNER]) {
    await assert.rejects(
      as(db, OWNER, (tx) => tx.query(`insert into collection_shares (collection_id, profile_id) values ('${ROASTS}', '${who}')`)),
      /row-level security/,
      `share with ${who}`,
    );
  }
  // Trusted members see every collection, and file recipes only where they contribute.
  assert.equal(await as(db, TRUSTED, (tx) => count(tx, "recipe_collections")), 2);
  await assert.rejects(
    as(db, TRUSTED, (tx) => tx.query(`insert into collection_recipes (collection_id, recipe_id) values ('${ROASTS}', '${PRIVATE}')`)),
    /row-level security/,
  );
  // Next door sees nothing.
  assert.equal(await as(db, OTHER_OWNER, (tx) => count(tx, "recipe_collections")), 0);
});

test("galley: cooking log and photos follow the recipe", async () => {
  const db = await galley();
  await share(db, GUEST);
  const cook = (who: string, recipe: string) =>
    as(db, who, (tx) => tx.query(`insert into recipe_cooks (recipe_id) values ($1)`, [recipe]));
  await cook(GUEST, SHARED);
  await assert.rejects(cook(GUEST, PRIVATE), /row-level security/);
  await cook(TRUSTED, PRIVATE);

  const upload = (who: string, recipe: string) =>
    as(db, who, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('recipe-photos', $1)`, [`${recipe}/a.jpg`]));
  await upload(OWNER, SHARED);
  await assert.rejects(upload(TRUSTED, SHARED), /row-level security/);
  await assert.rejects(upload(GUEST, SHARED), /row-level security/);

  await db.exec(`insert into storage.objects (bucket_id, name) values ('recipe-photos', '${SHARED}/a.jpg'), ('recipe-photos', '${PRIVATE}/b.jpg')`);
  const photos = (who: string) => as(db, who, (tx) => count(tx, "storage.objects"));
  assert.equal(await photos(GUEST), 1);
  assert.equal(await photos(TRUSTED), 2);
  assert.equal(await photos(OUTSIDER), 0);

  // A meal on the Logbook loses its recipe link, not itself, when the recipe goes.
  await db.exec(`
    insert into events (household_id, title, start_at, end_at, created_by, recipe_id)
    values ('${HOME}', 'Roast lamb', now(), now() + interval '1 hour', '${OWNER}', '${SHARED}');
    delete from recipes where id = '${SHARED}';
  `);
  const meal = await db.query<{ recipe_id: string | null }>("select recipe_id from events");
  assert.deepEqual(meal.rows, [{ recipe_id: null }]);
});
