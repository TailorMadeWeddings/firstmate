// Constitution: health data is private to each Owner. Not even the other
// Owner sees it, and nobody else gets near it. Setup lives in db.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Transaction } from "@electric-sql/pglite";
import { GUEST, HOME, OTHER_OWNER, OUTSIDER, OWNER, TRUSTED, as, count, setup } from "./db.ts";

const PARTNER = "00000000-0000-0000-0000-00000000000f";
const TABLES = ["health_profiles", "health_entries", "health_habits", "health_checkins"];

/** Two Owners in one household, each with a full set of health rows. */
async function twoOwners() {
  const db = await setup();
  await db.exec(`
    insert into auth.users (id, email) values ('${PARTNER}', 'partner@x');
    insert into household_members (household_id, profile_id, role) values ('${HOME}', '${PARTNER}', 'owner');
  `);
  for (const who of [OWNER, PARTNER]) {
    await db.exec(`
      insert into health_profiles (profile_id, baseline_date, baseline_weight_kg, baseline_waist_cm) values ('${who}', '2026-04-23', 102.35, 116);
      insert into health_entries (profile_id, entry_date, weight_kg, waist_cm) values ('${who}', '2026-10-19', 98.7, 110.5);
      insert into health_habits (profile_id, name, target) values ('${who}', 'Cut soft drinks', 'None');
      insert into health_checkins (profile_id, model, content) values ('${who}', 'test', 'Steady week.');
    `);
  }
  return db;
}

const seen = (db: Awaited<ReturnType<typeof twoOwners>>, who: string | null) =>
  as(db, who, async (tx) => Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, await count(tx, t)]))));

test("constitution: each Owner sees only their own health data, and nobody else sees any", async () => {
  const db = await twoOwners();
  const own = Object.fromEntries(TABLES.map((t) => [t, 1]));
  const none = Object.fromEntries(TABLES.map((t) => [t, 0]));
  assert.deepEqual(await seen(db, OWNER), own);
  assert.deepEqual(await seen(db, PARTNER), own);
  for (const who of [TRUSTED, GUEST, OUTSIDER, OTHER_OWNER, null]) {
    assert.deepEqual(await seen(db, who), none, `seen by ${who}`);
  }
  // Nor can they change or delete it.
  const touched = await as(db, PARTNER, async (tx) => {
    const a = await tx.query(`update health_entries set waist_cm = 50 where profile_id = '${OWNER}'`);
    const b = await tx.query(`delete from health_checkins where profile_id = '${OWNER}'`);
    return (a.affectedRows ?? 0) + (b.affectedRows ?? 0);
  });
  assert.equal(touched, 0);
});

test("constitution: you can only write your own rows, and only as an Owner", async () => {
  const db = await twoOwners();
  const add = (tx: Transaction, profile: string) =>
    tx.query(`insert into health_entries (profile_id, entry_date, waist_cm) values ($1, '2026-10-26', 110)`, [profile]);
  await as(db, OWNER, (tx) => add(tx, OWNER));
  await assert.rejects(as(db, OWNER, (tx) => add(tx, PARTNER)), /row-level security/);
  await assert.rejects(as(db, TRUSTED, (tx) => add(tx, TRUSTED)), /row-level security/);
  await assert.rejects(as(db, OUTSIDER, (tx) => add(tx, OUTSIDER)), /row-level security/);
  // Check-ins are kept as written.
  assert.equal(await as(db, OWNER, (tx) => tx.query(`update health_checkins set content = 'x'`).then((r) => r.affectedRows)), 0);
});

test("constitution: one entry per day, sensible numbers, partial weeks fine", async () => {
  const db = await twoOwners();
  const run = (sql: string) => as(db, OWNER, (tx) => tx.query(sql));
  await run(`insert into health_entries (entry_date) values ('2026-10-12')`);
  await assert.rejects(run(`insert into health_entries (entry_date, waist_cm) values ('2026-10-19', 109)`), /duplicate key/);
  await assert.rejects(run(`insert into health_entries (entry_date, weight_kg) values ('2026-10-05', 450)`), /check constraint/);
  await assert.rejects(run(`insert into health_entries (entry_date, golf_rounds) values ('2026-10-05', -1)`), /check constraint/);
});
