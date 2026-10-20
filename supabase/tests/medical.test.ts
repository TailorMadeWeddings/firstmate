// Medical records: Captains see and keep everyone's; Officers see only the
// children's emergency cards; appointments show on the Logbook as just
// "Appointment". Setup lives in db.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { GUEST, HOME, OTHER_HOME, OTHER_OWNER, OUTSIDER, OWNER, TRUSTED, as, count, setup } from "./db.ts";

const PARTNER = "00000000-0000-0000-0000-00000000000f";
const KID = "60000000-0000-0000-0000-000000000001";
const NEIGHBOURS_KID = "60000000-0000-0000-0000-000000000002";
const TABLES = ["medical_appointments", "medical_results", "medical_vaccinations", "medical_files"];

/** Two Captains and a child, each with a card; an appointment, result, vaccination and file for each. */
async function family(): Promise<PGlite> {
  const db = await setup();
  await db.exec(`
    insert into auth.users (id, email) values ('${PARTNER}', 'partner@x');
    insert into household_members (household_id, profile_id, role) values ('${HOME}', '${PARTNER}', 'owner');
    insert into dependents (id, household_id, display_name) values ('${KID}', '${HOME}', 'Teddy'), ('${NEIGHBOURS_KID}', '${OTHER_HOME}', 'Max');
  `);
  for (const [col, id] of [["profile_id", OWNER], ["profile_id", PARTNER], ["dependent_id", KID]]) {
    await db.exec(`
      insert into medical_profiles (household_id, ${col}, allergies, medicare_number, medicare_irn) values ('${HOME}', '${id}', 'Penicillin', '1234567890', '1');
      insert into medical_appointments (household_id, ${col}, starts_at, reason, created_by) values ('${HOME}', '${id}', now(), 'Check-up', '${OWNER}');
      insert into medical_results (household_id, ${col}, taken_on, test, result, created_by) values ('${HOME}', '${id}', '2026-10-01', 'Iron', 'Normal', '${OWNER}');
      insert into medical_vaccinations (household_id, ${col}, given_on, vaccine, created_by) values ('${HOME}', '${id}', '2026-04-01', 'Flu', '${OWNER}');
      insert into medical_files (household_id, ${col}, path, name, created_by) values ('${HOME}', '${id}', '${HOME}/${id}.pdf', 'Letter.pdf', '${OWNER}');
    `);
  }
  return db;
}

const seen = (db: PGlite, who: string | null) =>
  as(db, who, async (tx) => ({
    cards: (await tx.query<{ who: string }>(`select coalesce(profile_id, dependent_id)::text as who from medical_profiles order by 1`)).rows.map((r) => r.who),
    ...Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, await count(tx, t)]))),
  }));

test("medical: Captains see everyone's; Officers only the children's cards; nobody else anything", async () => {
  const db = await family();
  const all = { cards: [OWNER, PARTNER, KID].sort(), ...Object.fromEntries(TABLES.map((t) => [t, 3])) };
  assert.deepEqual(await seen(db, OWNER), all);
  assert.deepEqual(await seen(db, PARTNER), all);
  assert.deepEqual(await seen(db, TRUSTED), { cards: [KID], ...Object.fromEntries(TABLES.map((t) => [t, 0])) });
  for (const who of [GUEST, OUTSIDER, OTHER_OWNER, null]) {
    assert.deepEqual(await seen(db, who), { cards: [], ...Object.fromEntries(TABLES.map((t) => [t, 0])) }, `seen by ${who}`);
  }
  // Officers read the children's card but can't change it.
  assert.equal(await as(db, TRUSTED, (tx) => tx.query(`update medical_profiles set allergies = 'none'`).then((r) => r.affectedRows)), 0);
  await assert.rejects(
    as(db, TRUSTED, (tx) => tx.query(`insert into medical_results (household_id, dependent_id, taken_on, test) values ('${HOME}', '${KID}', '2026-10-02', 'X')`)),
    /row-level security/,
  );
});

test("medical: every record is about exactly one person in the household", async () => {
  const db = await family();
  const add = (tx: Transaction, profile: string | null, dependent: string | null) =>
    tx.query(`insert into medical_vaccinations (household_id, profile_id, dependent_id, given_on, vaccine) values ($1, $2, $3, '2026-10-01', 'MMR')`, [HOME, profile, dependent]);
  await as(db, OWNER, (tx) => add(tx, null, KID));
  await assert.rejects(as(db, OWNER, (tx) => add(tx, null, NEIGHBOURS_KID)), /row-level security/);
  await assert.rejects(as(db, OWNER, (tx) => add(tx, OUTSIDER, null)), /row-level security/);
  await assert.rejects(as(db, OWNER, (tx) => add(tx, OWNER, KID)), /one_person|row-level security/);
  await assert.rejects(as(db, OWNER, (tx) => add(tx, null, null)), /one_person|row-level security/);
  // Medicare numbers look like Medicare numbers.
  const card = (number: string, irn: string, expiry: string) =>
    as(db, OWNER, (tx) => tx.query(`update medical_profiles set medicare_number = $1, medicare_irn = $2, medicare_expiry = $3 where dependent_id = '${KID}'`, [number, irn, expiry]));
  await card("2123456701", "3", "08/2029");
  await assert.rejects(card("212345670", "3", "08/2029"), /check constraint/);
  await assert.rejects(card("2123456701", "0", "08/2029"), /check constraint/);
  await assert.rejects(card("2123456701", "3", "13/2029"), /check constraint/);
});

test("medical: an appointment shows on the Logbook as just 'Appointment', and goes with it", async () => {
  const db = await family();
  const save = (tx: Transaction, id: string | null, starts: string) =>
    tx
      .query<{ id: string }>(
        `select medical_save_appointment($1, $2, null, $3, $4, 45, 'Dr Lee', 'Ear infection', null, null) as id`,
        [id, HOME, KID, starts],
      )
      .then((r) => r.rows[0].id);
  const got = await as(db, OWNER, async (tx) => {
    const utc = async () =>
      (await tx.query<{ title: string; start: string; finish: string; who: string }>(
        `select e.title, to_char(e.start_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as start,
                to_char(e.end_at at time zone 'UTC', 'HH24:MI') as finish, a.dependent_id::text as who
           from events e join event_assignees a on a.event_id = e.id`,
      )).rows;
    const id = await save(tx, null, "2026-11-03T09:00:00Z");
    const first = await utc();
    await save(tx, id, "2026-11-04T10:00:00Z");
    const moved = await utc();
    await tx.query(`delete from medical_appointments where id = $1`, [id]);
    return { first, moved, after: await count(tx, "events") };
  });
  assert.deepEqual(got.first, [{ title: "Appointment", start: "2026-11-03 09:00", finish: "09:45", who: KID }]);
  assert.deepEqual(got.moved, [{ title: "Appointment", start: "2026-11-04 10:00", finish: "10:45", who: KID }]);
  assert.equal(got.after, 0);
});

test("medical: documents in storage are for Captains only", async () => {
  const db = await family();
  const upload = (who: string, folder: string) =>
    as(db, who, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('medical-files', $1)`, [`${folder}/letter.pdf`]));
  await upload(OWNER, HOME);
  await upload(PARTNER, HOME);
  await assert.rejects(upload(TRUSTED, HOME), /row-level security/);
  await assert.rejects(upload(OTHER_OWNER, HOME), /row-level security/);
  await db.exec(`insert into storage.objects (bucket_id, name) values ('medical-files', '${HOME}/x.pdf')`);
  assert.equal(await as(db, PARTNER, (tx) => count(tx, "storage.objects")), 1);
  assert.equal(await as(db, TRUSTED, (tx) => count(tx, "storage.objects")), 0);
});
