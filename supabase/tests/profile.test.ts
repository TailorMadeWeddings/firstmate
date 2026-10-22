// Profiles and calendars: a feed's secret link is its owner's alone, its
// events are the crew's to see, and only the server (the secret key) writes
// them. Setup lives in db.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { GUEST, HOME, OTHER_OWNER, OUTSIDER, OWNER, TRUSTED, as, count, setup } from "./db.ts";

const FEED = "60000000-0000-0000-0000-000000000001";

async function family() {
  const db = await setup();
  await db.exec(`
    insert into calendar_feeds (id, household_id, profile_id, name, url) values ('${FEED}', '${HOME}', '${TRUSTED}', 'Work', 'https://example.com/secret.ics');
    select calendar_feed_replace('${FEED}', '[{"title":"Standup","start_at":"2026-10-20T22:00:00Z","end_at":"2026-10-20T22:15:00Z","all_day":false}]', null);
    insert into calendar_links (profile_id, household_id, key_hash) values ('${OWNER}', '${HOME}', '${"a".repeat(64)}');
  `);
  return db;
}

test("profile: a feed's link is its owner's; its events are the crew's", async () => {
  const db = await family();
  assert.equal(await as(db, TRUSTED, (tx) => count(tx, "calendar_feeds")), 1);
  for (const who of [OWNER, GUEST, OUTSIDER, OTHER_OWNER, null]) {
    assert.equal(await as(db, who, (tx) => count(tx, "calendar_feeds")), 0, `feed seen by ${who}`);
  }
  for (const who of [OWNER, TRUSTED]) assert.equal(await as(db, who, (tx) => count(tx, "calendar_feed_events")), 1, `events seen by ${who}`);
  for (const who of [GUEST, OUTSIDER, OTHER_OWNER, null]) {
    assert.equal(await as(db, who, (tx) => count(tx, "calendar_feed_events")), 0, `events seen by ${who}`);
  }
  assert.equal(await as(db, OWNER, (tx) => count(tx, "calendar_links")), 1);
  assert.equal(await as(db, TRUSTED, (tx) => count(tx, "calendar_links")), 0);
});

test("profile: feeds are added for yourself only; nobody writes their events through the app", async () => {
  const db = await family();
  const add = (who: string, profile: string) =>
    as(db, who, (tx) => tx.query(`insert into calendar_feeds (household_id, profile_id, name, url) values ($1, $2, 'Mine', 'https://example.com/a.ics')`, [HOME, profile]));
  await add(OWNER, OWNER);
  await assert.rejects(add(OWNER, TRUSTED), /row-level security/);
  await assert.rejects(add(GUEST, GUEST), /row-level security/);
  await assert.rejects(
    as(db, TRUSTED, (tx) => tx.query(`insert into calendar_feed_events (feed_id, household_id, profile_id, title, start_at, end_at) values ($1, $2, $3, 'x', now(), now())`, [FEED, HOME, TRUSTED])),
    /row-level security/,
  );
  await assert.rejects(as(db, TRUSTED, (tx) => tx.query(`select calendar_feed_replace($1, '[]', null)`, [FEED])), /permission denied/);
});

test("profile: a failed read keeps the old events and says why; a good one replaces them", async () => {
  const db = await family();
  await db.exec(`select calendar_feed_replace('${FEED}', null, 'Not found (404)')`);
  assert.equal((await db.query<{ problem: string }>(`select problem from calendar_feeds`)).rows[0].problem, "Not found (404)");
  assert.equal(await as(db, OWNER, (tx) => count(tx, "calendar_feed_events")), 1);
  await db.exec(`select calendar_feed_replace('${FEED}', '[]', null)`);
  assert.equal((await db.query<{ problem: string | null }>(`select problem from calendar_feeds`)).rows[0].problem, null);
  assert.equal(await as(db, OWNER, (tx) => count(tx, "calendar_feed_events")), 0);
  // Removing a feed takes its events with it.
  await db.exec(`select calendar_feed_replace('${FEED}', '[{"title":"x","start_at":"2026-10-20T22:00:00Z","end_at":"2026-10-20T22:15:00Z","all_day":false}]', null)`);
  await as(db, TRUSTED, async (tx) => {
    await tx.query(`delete from calendar_feeds where id = $1`, [FEED]);
    assert.equal(await count(tx, "calendar_feed_events"), 0);
  });
});
