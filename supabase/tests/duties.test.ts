// Duties, the family to-do list: the crew share it, Guests and outsiders see
// nothing, assignees come from the household. Setup lives in db.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Transaction } from "@electric-sql/pglite";
import { GUEST, HOME, OTHER_HOME, OTHER_OWNER, OUTSIDER, OWNER, TRUSTED, as, count, setup } from "./db.ts";

const KID = "60000000-0000-0000-0000-000000000001";
const NEIGHBOURS_KID = "60000000-0000-0000-0000-000000000002";
const BINS = "70000000-0000-0000-0000-000000000001";

async function duties() {
  const db = await setup();
  await db.exec(`
    insert into dependents (id, household_id, display_name) values
      ('${KID}', '${HOME}', 'Teddy'), ('${NEIGHBOURS_KID}', '${OTHER_HOME}', 'Max');
    insert into duties (id, household_id, title, due_on, repeat, created_by)
      values ('${BINS}', '${HOME}', 'Bins out', '2026-10-20', 'weekly', '${OWNER}');
  `);
  return db;
}

const add = (tx: Transaction, values: Record<string, string | null>) => {
  const cols = ["household_id", "title", ...Object.keys(values)];
  const args = [HOME, "Book the dentist", ...Object.values(values)];
  return tx.query(`insert into duties (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})`, args);
};

test("duties: the crew share the list; Guests, outsiders and next door don't", async () => {
  const db = await duties();
  for (const [who, sees] of [
    [OWNER, 1],
    [TRUSTED, 1],
    [GUEST, 0],
    [OUTSIDER, 0],
    [OTHER_OWNER, 0],
    [null, 0],
  ] as const) {
    assert.equal(await as(db, who, (tx) => count(tx, "duties")), sees, `duties seen by ${who}`);
  }
  await assert.rejects(as(db, GUEST, (tx) => add(tx, {})), /row-level security/);
  await assert.rejects(as(db, OTHER_OWNER, (tx) => add(tx, {})), /row-level security/);
});

test("duties: anyone in the crew ticks things off; only Owners or the adder delete", async () => {
  const db = await duties();
  const ticked = await as(db, TRUSTED, async (tx) => {
    await tx.query(`update duties set done_at = now(), done_by = '${TRUSTED}' where id = '${BINS}'`);
    return (await tx.query<{ done: boolean }>(`select done_at is not null as done from duties`)).rows[0].done;
  });
  assert.equal(ticked, true);
  // The Owner's duty stays when a Trusted member tries to delete it…
  assert.equal(await as(db, TRUSTED, (tx) => tx.query(`delete from duties where id = '${BINS}'`).then((r) => r.affectedRows)), 0);
  // …but their own goes, and the Owner can delete anything.
  assert.equal(await as(db, TRUSTED, async (tx) => {
    await add(tx, {});
    return (await tx.query(`delete from duties where title = 'Book the dentist'`)).affectedRows;
  }), 1);
  assert.equal(await as(db, OWNER, (tx) => tx.query(`delete from duties`).then((r) => r.affectedRows)), 1);
});

test("duties: for someone in the household (one person at most), and repeats need a date", async () => {
  const db = await duties();
  await as(db, OWNER, (tx) => add(tx, { assigned_profile: TRUSTED }));
  await as(db, OWNER, (tx) => add(tx, { assigned_dependent: KID }));
  await assert.rejects(as(db, OWNER, (tx) => add(tx, { assigned_profile: OUTSIDER })), /row-level security/);
  await assert.rejects(as(db, OWNER, (tx) => add(tx, { assigned_dependent: NEIGHBOURS_KID })), /row-level security/);
  await assert.rejects(
    as(db, OWNER, (tx) => tx.query(`update duties set assigned_profile = '${OTHER_OWNER}'`)),
    /row-level security/,
  );
  await assert.rejects(as(db, OWNER, (tx) => add(tx, { assigned_profile: TRUSTED, assigned_dependent: KID })), /duties_one_assignee/);
  await assert.rejects(as(db, OWNER, (tx) => add(tx, { repeat: "weekly" })), /duties_repeat_needs_date/);
  await assert.rejects(as(db, OWNER, (tx) => add(tx, { repeat: "hourly", due_on: "2026-10-20" })), /check constraint/);
  await assert.rejects(as(db, OWNER, (tx) => add(tx, { category: "  " })), /check constraint/);
});
