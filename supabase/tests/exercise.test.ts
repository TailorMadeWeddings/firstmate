// Exercise: activities, schedules on the Logbook, sessions, programs and the
// daily checklist. Each person keeps their own; Captains keep the children's.
// Setup lives in db.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { GUEST, HOME, OTHER_OWNER, OUTSIDER, OWNER, TRUSTED, as, count, setup } from "./db.ts";

const PARTNER = "00000000-0000-0000-0000-00000000000f";
const KID = "60000000-0000-0000-0000-000000000001";
const AIKIDO = "a0000000-0000-0000-0000-000000000001";
const SWIM = "a0000000-0000-0000-0000-000000000002";
const OFFICER_GYM = "a0000000-0000-0000-0000-000000000003";

async function family(): Promise<PGlite> {
  const db = await setup();
  await db.exec(`
    insert into auth.users (id, email) values ('${PARTNER}', 'partner@x');
    insert into household_members (household_id, profile_id, role) values ('${HOME}', '${PARTNER}', 'owner');
    insert into dependents (id, household_id, display_name) values ('${KID}', '${HOME}', 'Teddy');
    insert into activities (id, household_id, profile_id, dependent_id, name, minutes) values
      ('${AIKIDO}', '${HOME}', '${OWNER}', null, 'Aikido', 90),
      ('${SWIM}', '${HOME}', null, '${KID}', 'Swimming', 30),
      ('${OFFICER_GYM}', '${HOME}', '${TRUSTED}', null, 'Gym', 60);
    insert into exercise_programs (household_id, profile_id, name, exercise, goal) values ('${HOME}', '${OWNER}', '100 push-ups', 'Push-ups', 100);
    insert into daily_items (household_id, profile_id, name) values ('${HOME}', '${OWNER}', 'Hamstring stretch');
  `);
  return db;
}

const names = (db: PGlite, who: string | null) =>
  as(db, who, (tx) => tx.query<{ name: string }>(`select name from activities order by name`).then((r) => r.rows.map((x) => x.name)));

test("exercise: your own activities are yours alone; Captains keep the children's", async () => {
  const db = await family();
  assert.deepEqual(await names(db, OWNER), ["Aikido", "Swimming"]);
  assert.deepEqual(await names(db, PARTNER), ["Swimming"]); // not Ben's aikido
  assert.deepEqual(await names(db, TRUSTED), ["Gym"]); // their own only, not the kids'
  for (const who of [GUEST, OUTSIDER, OTHER_OWNER, null]) assert.deepEqual(await names(db, who), [], `seen by ${who}`);
  for (const t of ["exercise_programs", "daily_items"]) {
    assert.equal(await as(db, OWNER, (tx) => count(tx, t)), 1);
    assert.equal(await as(db, PARTNER, (tx) => count(tx, t)), 0, `${t} for the other Captain`);
  }
  // Nobody adds activities for someone else (a child is fine for a Captain).
  const add = (who: string, profile: string | null, dependent: string | null) =>
    as(db, who, (tx) => tx.query(`insert into activities (household_id, profile_id, dependent_id, name) values ($1, $2, $3, 'Golf')`, [HOME, profile, dependent]));
  await add(OWNER, OWNER, null);
  await add(PARTNER, null, KID);
  await assert.rejects(add(PARTNER, OWNER, null), /row-level security/);
  await assert.rejects(add(TRUSTED, null, KID), /row-level security/);
});

test("exercise: a schedule is a repeating Logbook event named for the activity, and follows it", async () => {
  const db = await family();
  const got = await as(db, OWNER, async (tx: Transaction) => {
    const schedule = (
      await tx.query<{ id: string }>(
        `select exercise_save_schedule(null, $1, '2026-10-20T08:00:00Z', 90, 'FREQ=WEEKLY;INTERVAL=1;BYDAY=TU,TH', null) as id`,
        [AIKIDO],
      )
    ).rows[0].id;
    const event = async () =>
      (await tx.query(`select e.title, e.recurrence_rule as rule, a.profile_id::text as who from events e join event_assignees a on a.event_id = e.id`)).rows;
    const made = await event();
    await tx.query(`update activities set name = 'Aikido (Kobayashi)' where id = $1`, [AIKIDO]);
    const renamed = await event();
    // Deleting it on the Logbook ends the schedule too.
    await tx.query(`delete from events`);
    const schedules = await count(tx, "activity_schedules");
    return { schedule: Boolean(schedule), made, renamed, schedules };
  });
  assert.deepEqual(got.made, [{ title: "Aikido", rule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=TU,TH", who: OWNER }]);
  assert.equal((got.renamed[0] as { title: string }).title, "Aikido (Kobayashi)");
  assert.equal(got.schedules, 0);
});

test("exercise: ticking off a scheduled session adds no event; a one-off gets its own, and takes it when deleted", async () => {
  const db = await family();
  const got = await as(db, PARTNER, async (tx: Transaction) => {
    const schedule = (
      await tx.query<{ id: string }>(`select exercise_save_schedule(null, $1, '2026-10-24T23:00:00Z', 30, 'FREQ=WEEKLY;INTERVAL=1;BYDAY=SA', null) as id`, [SWIM])
    ).rows[0].id;
    const tick = (occurrence: string) =>
      tx.query(`select exercise_save_session(null, $1, $2, 30, 0.4, 'Swam 400 m', $3, $2)`, [SWIM, occurrence, schedule]);
    await tick("2026-10-24T23:00:00Z");
    const afterTick = await count(tx, "events");
    let twice = "allowed";
    await tx.query("savepoint s");
    try {
      await tick("2026-10-24T23:00:00Z");
    } catch {
      twice = "refused";
    }
    await tx.query("rollback to savepoint s");
    const oneOff = (await tx.query<{ id: string }>(`select exercise_save_session(null, $1, '2026-10-29T06:00:00Z', 45, null, null) as id`, [SWIM])).rows[0].id;
    const afterOneOff = await count(tx, "events");
    await tx.query(`delete from activity_sessions where id = $1`, [oneOff]);
    return { afterTick, twice, afterOneOff, afterDelete: await count(tx, "events"), sessions: await count(tx, "activity_sessions") };
  });
  assert.deepEqual(got, { afterTick: 1, twice: "refused", afterOneOff: 2, afterDelete: 1, sessions: 1 });
});

test("exercise: program logs and daily ticks are your own, one tick per item per day", async () => {
  const db = await family();
  const got = await as(db, OWNER, async (tx: Transaction) => {
    const program = (await tx.query<{ id: string }>(`select id from exercise_programs`)).rows[0].id;
    const item = (await tx.query<{ id: string }>(`select id from daily_items`)).rows[0].id;
    await tx.query(`insert into program_logs (program_id, household_id, done_on, kind, result) values ($1, $2, '2026-10-20', 'test', 12)`, [program, HOME]);
    await tx.query(`insert into program_logs (program_id, household_id, done_on, kind, sets) values ($1, $2, '2026-10-22', 'workout', '{6,7,6,6,8}')`, [program, HOME]);
    await tx.query(`insert into daily_ticks (item_id, household_id, day) values ($1, $2, '2026-10-20')`, [item, HOME]);
    let twice = "allowed";
    await tx.query("savepoint s");
    try {
      await tx.query(`insert into daily_ticks (item_id, household_id, day) values ($1, $2, '2026-10-20')`, [item, HOME]);
    } catch {
      twice = "refused";
    }
    await tx.query("rollback to savepoint s");
    let badShape = "allowed";
    await tx.query("savepoint t");
    try {
      await tx.query(`insert into program_logs (program_id, household_id, done_on, kind, result) values ($1, $2, '2026-10-24', 'workout', 5)`, [program, HOME]);
    } catch {
      badShape = "refused";
    }
    await tx.query("rollback to savepoint t");
    return { logs: await count(tx, "program_logs"), ticks: await count(tx, "daily_ticks"), twice, badShape };
  });
  assert.deepEqual(got, { logs: 2, ticks: 1, twice: "refused", badShape: "refused" });
});

test("exercise: routines are your own; saving replaces the exercises; links are web links only", async () => {
  const db = await family();
  const save = (tx: Transaction, routine: string | null, profile: string, exercises: object[], link: string | null = null) =>
    tx
      .query<{ id: string }>(`select exercise_save_routine($1, $2, $3, 'Golf Strength', 'Golf', null, 'Cat-cow x10', null, $4, 45, '{MO,WE,FR}', $5) as id`, [
        routine, HOME, profile, link, JSON.stringify(exercises),
      ])
      .then((r) => r.rows[0].id);
  const refused = async (tx: Transaction, fn: () => Promise<unknown>) => {
    await tx.query("savepoint s");
    try {
      await fn();
      return "allowed";
    } catch {
      return "refused";
    } finally {
      await tx.query("rollback to savepoint s");
    }
  };
  const got = await as(db, OWNER, async (tx: Transaction) => {
    const id = await save(tx, null, OWNER, [
      { name: "Plate rotations", sets: 3, reps: 12, rep_unit: "reps", load: "5-10 kg plate" },
      { name: "Plank press", sets: 3, reps: 8, rep_unit: "per_side", load: "5-8 kg DB", cue: "Feet wide" },
    ], "https://youtu.be/abc");
    await save(tx, id, OWNER, [{ name: "Plank press", sets: 3, reps: 10, rep_unit: "per_side", load: "8 kg DB" }], "https://youtu.be/abc");
    const exercises = (await tx.query(`select position, name, reps, load from routine_exercises order by position`)).rows;
    await tx.query(`insert into routine_logs (routine_id, household_id, done_on, done) values ($1, $2, '2026-10-21', '[{"name":"Plank press","reps":[10,10,9]}]')`, [id, HOME]);
    return {
      exercises,
      logs: await count(tx, "routine_logs"),
      forSomeoneElse: await refused(tx, () => save(tx, null, PARTNER, [])),
      script: await refused(tx, () => save(tx, null, OWNER, [], "javascript:alert(1)")),
      badUnit: await refused(tx, () => save(tx, id, OWNER, [{ name: "Chop", sets: 3, reps: 12, rep_unit: "total" }])),
    };
  });
  assert.deepEqual(got, {
    exercises: [{ position: 1, name: "Plank press", reps: 10, load: "8 kg DB" }],
    logs: 1,
    forSomeoneElse: "refused",
    script: "refused",
    badUnit: "refused",
  });

  // Someone else's routine is invisible, and can't be changed by naming it.
  await db.exec(`insert into routines (id, household_id, profile_id, name) values ('b0000000-0000-0000-0000-000000000001', '${HOME}', '${OWNER}', 'Legs')`);
  for (const who of [PARTNER, TRUSTED, GUEST, OUTSIDER, OTHER_OWNER, null]) assert.equal(await as(db, who, (tx) => count(tx, "routines")), 0, `seen by ${who}`);
  await assert.rejects(as(db, PARTNER, (tx) => save(tx, "b0000000-0000-0000-0000-000000000001", PARTNER, [])), /routine not found/);
  await assert.rejects(
    as(db, PARTNER, (tx) => tx.query(`insert into routine_exercises (routine_id, position, name, sets, reps) values ('b0000000-0000-0000-0000-000000000001', 1, 'Squat', 3, 5)`)),
    /row-level security/,
  );
});
