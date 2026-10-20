// Voyage: Captains keep every book, each other's included; Officers tell
// stories and see only their own; nobody else sees anything. Setup lives in db.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { GUEST, HOME, OTHER_HOME, OTHER_OWNER, OUTSIDER, OWNER, TRUSTED, as, count, setup } from "./db.ts";

const PARTNER = "00000000-0000-0000-0000-00000000000f";
const KID = "60000000-0000-0000-0000-000000000001";
const NEIGHBOURS_KID = "60000000-0000-0000-0000-000000000002";
const MOMENT = "70000000-0000-0000-0000-000000000001";
const STORY = "70000000-0000-0000-0000-000000000002";

/** Two Captains and a child; a page in each book, a family page with a section, and a grandparent's story. */
async function family(): Promise<PGlite> {
  const db = await setup();
  await db.exec(`
    insert into auth.users (id, email) values ('${PARTNER}', 'partner@x');
    insert into household_members (household_id, profile_id, role) values ('${HOME}', '${PARTNER}', 'owner');
    insert into dependents (id, household_id, display_name) values ('${KID}', '${HOME}', 'Teddy'), ('${NEIGHBOURS_KID}', '${OTHER_HOME}', 'Max');
    insert into voyage_entries (household_id, dependent_id, template, period, created_by) values ('${HOME}', '${KID}', 'month', 1, '${OWNER}');
    insert into voyage_entries (household_id, profile_id, template, period, created_by) values ('${HOME}', '${PARTNER}', 'year', 7, '${PARTNER}');
    insert into voyage_entries (id, household_id, template, title, created_by) values ('${MOMENT}', '${HOME}', 'moment', 'Beach holiday', '${OWNER}');
    insert into voyage_notes (household_id, entry_id, dependent_id, body, created_by) values ('${HOME}', '${MOMENT}', '${KID}', 'First swim', '${OWNER}');
    insert into voyage_notes (id, household_id, dependent_id, body, created_by) values ('${STORY}', '${HOME}', '${KID}', 'Gran''s story', '${TRUSTED}');
    insert into voyage_photos (household_id, entry_id, path, created_by) values ('${HOME}', '${MOMENT}', '${HOME}/a.jpg', '${OWNER}');
    insert into voyage_photos (household_id, note_id, path, created_by) values ('${HOME}', '${STORY}', '${HOME}/b.jpg', '${TRUSTED}');
    insert into storage.objects (bucket_id, name) values ('voyage-photos', '${HOME}/a.jpg'), ('voyage-photos', '${HOME}/b.jpg');
  `);
  return db;
}

const seen = (db: PGlite, who: string | null) =>
  as(db, who, async (tx) => ({
    entries: await count(tx, "voyage_entries"),
    notes: await count(tx, "voyage_notes"),
    photos: await count(tx, "voyage_photos"),
    // Signed-out visitors can't query storage at all.
    files: who ? Number((await tx.query<{ n: number }>(`select count(*)::int as n from storage.objects where bucket_id = 'voyage-photos'`)).rows[0].n) : 0,
  }));

test("voyage: Captains see every book; Officers only their own stories; nobody else anything", async () => {
  const db = await family();
  const all = { entries: 3, notes: 2, photos: 2, files: 2 };
  assert.deepEqual(await seen(db, OWNER), all);
  assert.deepEqual(await seen(db, PARTNER), all);
  assert.deepEqual(await seen(db, TRUSTED), { entries: 0, notes: 1, photos: 1, files: 1 });
  for (const who of [GUEST, OUTSIDER, OTHER_OWNER, null]) {
    assert.deepEqual(await seen(db, who), { entries: 0, notes: 0, photos: 0, files: 0 }, `seen by ${who}`);
  }
});

test("voyage: Officers tell stories but can't touch the books", async () => {
  const db = await family();
  const story = (tx: Transaction, entry: string | null, dependent: string, by = TRUSTED) =>
    tx.query(`insert into voyage_notes (household_id, entry_id, dependent_id, body, created_by) values ($1, $2, $3, 'Once upon a time', $4)`, [HOME, entry, dependent, by]);
  await as(db, TRUSTED, (tx) => story(tx, null, KID));
  // Stories about a Captain are fine; about an Officer or a neighbour's child, not.
  await as(db, TRUSTED, (tx) => tx.query(`insert into voyage_notes (household_id, profile_id, body) values ('${HOME}', '${OWNER}', 'Your dad as a boy')`));
  await assert.rejects(as(db, TRUSTED, (tx) => tx.query(`insert into voyage_notes (household_id, profile_id, body) values ('${HOME}', '${TRUSTED}', 'Me')`)), /row-level security/);
  await assert.rejects(as(db, TRUSTED, (tx) => story(tx, null, NEIGHBOURS_KID)), /row-level security/);
  // Not a section of a family page, and not in someone else's name.
  await assert.rejects(as(db, TRUSTED, (tx) => story(tx, MOMENT, KID)), /row-level security/);
  await assert.rejects(as(db, TRUSTED, (tx) => story(tx, null, KID, OWNER)), /row-level security/);
  await assert.rejects(
    as(db, TRUSTED, (tx) => tx.query(`insert into voyage_entries (household_id, dependent_id, template, period) values ('${HOME}', '${KID}', 'month', 2)`)),
    /row-level security/,
  );
  // A photo a Captain put on their story stays, file and all; their own goes.
  await db.exec(`
    insert into voyage_photos (household_id, note_id, path, created_by) values ('${HOME}', '${STORY}', '${HOME}/c.jpg', '${OWNER}');
    insert into storage.objects (bucket_id, name) values ('voyage-photos', '${HOME}/c.jpg');
  `);
  const removeFile = (name: string) => as(db, TRUSTED, (tx) => tx.query(`delete from storage.objects where name = $1`, [`${HOME}/${name}`]).then((r) => r.affectedRows));
  assert.equal(await removeFile("c.jpg"), 0);
  assert.equal(await removeFile("b.jpg"), 1);
  // Their own story they can change and delete; a Captain's section they can't even see.
  assert.equal(await as(db, TRUSTED, (tx) => tx.query(`update voyage_notes set body = 'Edited'`).then((r) => r.affectedRows)), 1);
  assert.equal(await as(db, TRUSTED, (tx) => tx.query(`delete from voyage_notes`).then((r) => r.affectedRows)), 1);
  // Captains can tidy an Officer's story.
  assert.equal(await as(db, PARTNER, (tx) => tx.query(`delete from voyage_notes where id = '${STORY}'`).then((r) => r.affectedRows)), 1);
});

test("voyage: pages are about the family, a child, or a Captain, one per slot", async () => {
  const db = await family();
  const add = (tx: Transaction, profile: string | null, dependent: string | null, period: number | null = 0) =>
    tx.query(`insert into voyage_entries (household_id, profile_id, dependent_id, template, period) values ($1, $2, $3, 'name', $4)`, [HOME, profile, dependent, period]);
  await as(db, OWNER, async (tx) => {
    await add(tx, null, KID);
    await add(tx, PARTNER, null);
    await add(tx, null, null);
  });
  await assert.rejects(as(db, OWNER, (tx) => add(tx, TRUSTED, null)), /row-level security/);
  await assert.rejects(as(db, OWNER, (tx) => add(tx, null, NEIGHBOURS_KID)), /row-level security/);
  await assert.rejects(as(db, OWNER, (tx) => add(tx, OWNER, KID)), /one_subject|row-level security/);
  // The same slot twice is refused, for a person or the family; collections have no limit.
  await assert.rejects(as(db, OWNER, async (tx) => { await add(tx, null, KID); await add(tx, null, KID); }), /voyage_entries_slot/);
  await assert.rejects(as(db, OWNER, async (tx) => { await add(tx, null, null); await add(tx, null, null); }), /voyage_entries_slot/);
  await as(db, OWNER, async (tx) => { await add(tx, null, KID, null); await add(tx, null, KID, null); });
  // One section per person on a family page.
  await assert.rejects(
    as(db, OWNER, (tx) => tx.query(`insert into voyage_notes (household_id, entry_id, dependent_id, body) values ('${HOME}', '${MOMENT}', '${KID}', 'Again')`)),
    /voyage_notes_section/,
  );
});

test("voyage: a Captain's birthday is set by the Captains, not by Officers", async () => {
  const db = await family();
  const set = (who: string, whose: string) => as(db, who, (tx) => tx.query(`update profiles set date_of_birth = '1991-03-20' where id = $1`, [whose]).then((r) => r.affectedRows));
  assert.equal(await set(OWNER, OWNER), 1);
  assert.equal(await set(OWNER, PARTNER), 1);
  assert.equal(await set(TRUSTED, OWNER), 0);
});
