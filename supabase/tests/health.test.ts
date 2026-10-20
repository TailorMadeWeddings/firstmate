// Apple Health: daily numbers and the Shortcut's key. Each person sees only
// their own; only the import (the secret key, which skips row-level
// security) writes the numbers. Setup lives in db.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { GUEST, HOME, OTHER_OWNER, OUTSIDER, OWNER, TRUSTED, as, count, setup } from "./db.ts";

const PARTNER = "00000000-0000-0000-0000-00000000000f";
const HASH = "a".repeat(64);

async function family() {
  const db = await setup();
  await db.exec(`
    insert into auth.users (id, email) values ('${PARTNER}', 'partner@x');
    insert into household_members (household_id, profile_id, role) values ('${HOME}', '${PARTNER}', 'owner');
    insert into health_daily (household_id, profile_id, day, steps, resting_hr) values
      ('${HOME}', '${OWNER}', '2026-10-19', 8432, 58), ('${HOME}', '${OWNER}', '2026-10-20', 1200, null),
      ('${HOME}', '${TRUSTED}', '2026-10-20', 9000, 64);
    insert into health_keys (profile_id, household_id, key_hash) values ('${OWNER}', '${HOME}', '${HASH}');
  `);
  return db;
}

test("health: your numbers and key are yours alone, even from the other Captain", async () => {
  const db = await family();
  assert.equal(await as(db, OWNER, (tx) => count(tx, "health_daily")), 2);
  assert.equal(await as(db, TRUSTED, (tx) => count(tx, "health_daily")), 1);
  assert.equal(await as(db, OWNER, (tx) => count(tx, "health_keys")), 1);
  for (const who of [PARTNER, GUEST, OUTSIDER, OTHER_OWNER, null]) {
    assert.equal(await as(db, who, (tx) => count(tx, "health_daily")), 0, `numbers seen by ${who}`);
    assert.equal(await as(db, who, (tx) => count(tx, "health_keys")), 0, `key seen by ${who}`);
  }
});

test("health: nobody writes numbers through the app; keys are made and revoked by their owner", async () => {
  const db = await family();
  await assert.rejects(
    as(db, OWNER, (tx) => tx.query(`insert into health_daily (household_id, profile_id, day, steps) values ($1, $2, '2026-10-21', 99999)`, [HOME, OWNER])),
    /row-level security/,
  );
  const got = await as(db, OWNER, async (tx) => {
    const changed = await tx.query(`update health_daily set steps = 99999`);
    await tx.query(`insert into health_keys (profile_id, household_id, key_hash) values ($1, $2, $3) on conflict (profile_id) do update set key_hash = excluded.key_hash`, [OWNER, HOME, "b".repeat(64)]);
    const hash = (await tx.query<{ key_hash: string }>(`select key_hash from health_keys`)).rows[0].key_hash;
    await tx.query(`delete from health_keys`);
    return { changed: changed.affectedRows, hash, left: await count(tx, "health_keys") };
  });
  assert.deepEqual(got, { changed: 0, hash: "b".repeat(64), left: 0 });
  // Not for someone else, and only a real sha256.
  await assert.rejects(
    as(db, PARTNER, (tx) => tx.query(`insert into health_keys (profile_id, household_id, key_hash) values ($1, $2, $3)`, [OWNER, HOME, "c".repeat(64)])),
    /row-level security/,
  );
  await assert.rejects(
    as(db, TRUSTED, (tx) => tx.query(`insert into health_keys (profile_id, household_id, key_hash) values ($1, $2, 'the key itself')`, [TRUSTED, HOME])),
    /check constraint/,
  );
});

test("health: one row per person per day, within sensible ranges", async () => {
  const db = await family();
  await assert.rejects(db.exec(`insert into health_daily (household_id, profile_id, day, steps) values ('${HOME}', '${OWNER}', '2026-10-20', 1)`), /duplicate key/);
  await assert.rejects(db.exec(`insert into health_daily (household_id, profile_id, day, resting_hr) values ('${HOME}', '${OWNER}', '2026-10-21', 400)`), /check constraint/);
});
