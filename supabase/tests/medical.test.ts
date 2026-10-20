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

test("medical: an Officer keeps their own records, private to them", async () => {
  const db = await family();
  await as(db, TRUSTED, async (tx) => {
    await tx.query(`insert into medical_profiles (household_id, profile_id, allergies) values ('${HOME}', '${TRUSTED}', 'Bee stings')`);
    await tx.query(`insert into medical_results (household_id, profile_id, taken_on, test) values ('${HOME}', '${TRUSTED}', '2026-10-01', 'Cholesterol')`);
  });
  await db.exec(`
    insert into medical_profiles (household_id, profile_id, allergies) values ('${HOME}', '${TRUSTED}', 'Bee stings');
    insert into medical_results (household_id, profile_id, taken_on, test, created_by) values ('${HOME}', '${TRUSTED}', '2026-10-01', 'Cholesterol', '${TRUSTED}');
  `);
  const officer = await seen(db, TRUSTED);
  assert.deepEqual(officer.cards, [TRUSTED, KID].sort()); // their own, and the children's to read
  assert.equal(officer.medical_results, 1); // only their own
  const captain = await seen(db, OWNER);
  assert.ok(!captain.cards.includes(TRUSTED), "Captains don't see an Officer's card");
  assert.equal(captain.medical_results, 3);
  // And an Officer can't write anyone else's.
  await assert.rejects(
    as(db, TRUSTED, (tx) => tx.query(`insert into medical_results (household_id, profile_id, taken_on, test) values ('${HOME}', '${OWNER}', '2026-10-02', 'X')`)),
    /row-level security/,
  );
});

test("medical: a reminder for an appointment goes on Duties, says who and when only, and follows it", async () => {
  const db = await family();
  const save = (tx: Transaction, id: string | null, starts: string, remind: number | null) =>
    tx
      .query<{ id: string }>(`select medical_save_appointment($1, $2, null, $3, $4, 30, 'Dr Lee', 'Ear infection', null, null, $5) as id`, [id, HOME, KID, starts, remind])
      .then((r) => r.rows[0].id);
  const duties = (tx: Transaction) =>
    tx.query<{ title: string; due: string; important: boolean }>(`select title, due_on::text as due, important from duties`).then((r) => r.rows);
  const got = await as(db, OWNER, async (tx) => {
    const id = await save(tx, null, "2030-11-03T22:00:00Z", 1); // Mon 4 Nov, 9am in Sydney
    const first = await duties(tx);
    await save(tx, id, "2030-11-10T23:30:00Z", 2); // Mon 11 Nov, 10:30am
    const moved = await duties(tx);
    await save(tx, id, "2030-11-10T23:30:00Z", null);
    const off = await duties(tx);
    await save(tx, id, "2030-11-10T23:30:00Z", 0);
    await tx.query(`delete from medical_appointments where id = $1`, [id]);
    return { first, moved, off, gone: await duties(tx) };
  });
  assert.deepEqual(got.first, [{ title: "Appointment for Teddy, Mon 4 Nov, 9:00am", due: "2030-11-03", important: true }]);
  assert.deepEqual(got.moved, [{ title: "Appointment for Teddy, Mon 11 Nov, 10:30am", due: "2030-11-09", important: true }]);
  assert.deepEqual(got.off, []);
  assert.deepEqual(got.gone, []);
});

test("medical: documents follow their record; the crew can upload to their own household only", async () => {
  const db = await family();
  const upload = (who: string, folder: string) =>
    as(db, who, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('medical-files', $1)`, [`${folder}/letter.pdf`]));
  await upload(OWNER, HOME);
  await upload(TRUSTED, HOME);
  await assert.rejects(upload(GUEST, HOME), /row-level security/);
  await assert.rejects(upload(OTHER_OWNER, HOME), /row-level security/);
  // The family's three files, plus an Officer's own.
  await db.exec(`
    insert into medical_files (household_id, profile_id, path, name, created_by) values ('${HOME}', '${TRUSTED}', '${HOME}/officer.pdf', 'Mine.pdf', '${TRUSTED}');
    insert into storage.objects (bucket_id, name) select 'medical-files', path from medical_files;
  `);
  const files = (who: string) => as(db, who, (tx) => tx.query<{ name: string }>(`select name from storage.objects order by name`).then((r) => r.rows.length));
  assert.equal(await files(PARTNER), 3);
  assert.equal(await files(TRUSTED), 1);
  assert.equal(await files(OTHER_OWNER), 0);
});
