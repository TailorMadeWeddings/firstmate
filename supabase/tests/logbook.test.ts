// The Logbook: crew (Owners and Trusted members) share the household's
// events; Guests and outsiders see none of them. Setup lives in db.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { GUEST, HOME, OTHER_HOME, OTHER_OWNER, OUTSIDER, OWNER, TRUSTED, as, count, setup } from "./db.ts";

const TEDDY = "60000000-0000-0000-0000-000000000001";
const NEIGHBOUR_KID = "60000000-0000-0000-0000-000000000002";

async function logbook() {
  const db = await setup();
  await db.exec(`
    insert into dependents (id, household_id, display_name) values
      ('${TEDDY}', '${HOME}', 'Teddy'), ('${NEIGHBOUR_KID}', '${OTHER_HOME}', 'Next door kid');
  `);
  return db;
}

/** Saves an event through the app's function; returns its id. */
const save = (
  tx: Transaction,
  opts: { event?: string; splitFrom?: string; title?: string; profiles?: string[]; dependents?: string[]; home?: string },
) =>
  tx
    .query<{ id: string }>(
      `select logbook_save_event($1, $2, $3, null, null, '2026-10-20T05:00:00Z', '2026-10-20T06:00:00Z', false,
        'FREQ=WEEKLY;INTERVAL=1;BYDAY=TU', null, $4, $5, $6) as id`,
      [
        opts.event ?? null,
        opts.home ?? HOME,
        opts.title ?? "Swimming",
        opts.profiles ?? [],
        opts.dependents ?? [],
        opts.splitFrom ?? null,
      ],
    )
    .then((r) => r.rows[0].id);

const asWith = <T>(db: PGlite, who: string | null, fn: (tx: Transaction) => Promise<T>) => as(db, who, fn);

test("logbook: crew see and add events; guests and outsiders don't", async () => {
  const db = await logbook();
  await db.exec(`insert into events (household_id, title, start_at, end_at, created_by)
                 values ('${HOME}', 'Dinner', now(), now(), '${OWNER}')`);
  for (const [who, sees] of [
    [OWNER, 1],
    [TRUSTED, 1],
    [GUEST, 0],
    [OUTSIDER, 0],
    [OTHER_OWNER, 0],
    [null, 0],
  ] as const) {
    assert.equal(await asWith(db, who, (tx) => count(tx, "events")), sees, String(who));
  }
  // Trusted members add their own events…
  assert.ok(await asWith(db, TRUSTED, (tx) => save(tx, {})));
  // …but guests can't add any.
  await assert.rejects(asWith(db, GUEST, (tx) => save(tx, {})), /row-level security/);
});

test("logbook: an event saves with its assignees, and edits replace them", async () => {
  const db = await logbook();
  const result = await asWith(db, OWNER, async (tx) => {
    const id = await save(tx, { profiles: [OWNER, TRUSTED], dependents: [TEDDY] });
    const before = await count(tx, "event_assignees");
    await save(tx, { event: id, title: "Swimming lessons", dependents: [TEDDY] });
    const after = (await tx.query("select profile_id, dependent_id from event_assignees")).rows;
    const title = (await tx.query<{ title: string }>("select title from events")).rows[0].title;
    return { before, after, title };
  });
  assert.equal(result.before, 3);
  assert.deepEqual(result.after, [{ profile_id: null, dependent_id: TEDDY }]);
  assert.equal(result.title, "Swimming lessons");
});

test("logbook: 'this and following' ends the old series and starts a new one", async () => {
  const db = await logbook();
  const rows = await asWith(db, OWNER, async (tx) => {
    const id = await save(tx, { dependents: [TEDDY] });
    await save(tx, { event: id, splitFrom: "2026-11-03T05:00:00Z", title: "Swimming (new pool)", dependents: [TEDDY] });
    return (
      await tx.query(
        "select title, (recurrence_ends_at at time zone 'UTC')::text as ends from events order by created_at, title",
      )
    ).rows;
  });
  assert.deepEqual(rows, [
    { title: "Swimming", ends: "2026-11-03 05:00:00" },
    { title: "Swimming (new pool)", ends: null },
  ]);
});

test("logbook: assignees must be in the household, and others' events are read-only to trusted", async () => {
  const db = await logbook();
  await assert.rejects(
    asWith(db, OWNER, (tx) => save(tx, { dependents: [NEIGHBOUR_KID] })),
    /assignees must be in the household/,
  );
  await assert.rejects(asWith(db, OWNER, (tx) => save(tx, { profiles: [OTHER_OWNER] })), /assignees must be/);
  await assert.rejects(asWith(db, OWNER, (tx) => save(tx, { title: "  " })), /give the event a name/);
  const ownerEvent = await asWith(db, OWNER, (tx) => save(tx, {}));
  // as() rolls back, so make one that sticks for the next check.
  await db.exec(`insert into events (id, household_id, title, start_at, end_at, created_by)
                 values ('70000000-0000-0000-0000-000000000001', '${HOME}', 'Owner thing', now(), now(), '${OWNER}')`);
  assert.ok(ownerEvent);
  await assert.rejects(
    asWith(db, TRUSTED, (tx) => save(tx, { event: "70000000-0000-0000-0000-000000000001", title: "Hijacked" })),
    /event not found/,
  );
});

test("crew colours: hex only; owners can recolour household members", async () => {
  const db = await logbook();
  await asWith(db, OWNER, async (tx) => {
    await tx.query(`update profiles set color = '#2563eb' where id = '${TRUSTED}'`);
    await tx.query(`update dependents set color = '#e11d48' where id = '${TEDDY}'`);
  });
  await assert.rejects(asWith(db, OWNER, (tx) => tx.query(`update dependents set color = 'red'`)), /check constraint/);
  // A trusted member can only change their own profile.
  const changed = await asWith(db, TRUSTED, async (tx) => {
    const r = await tx.query(`update profiles set color = '#000000' where id = '${OWNER}'`);
    return r.affectedRows;
  });
  assert.equal(changed, 0);
});
