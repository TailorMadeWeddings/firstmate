// Runs every migration in PGlite (real Postgres in-process, no Docker) and
// checks the Ledger's access rules: Owners of the household see and change
// everything, nobody else sees anything.
//
// ponytail: the auth schema below is a stand-in for Supabase's (auth.uid()
// reads the JWT claims the same way). If a migration starts relying on more
// of Supabase, extend the stand-in.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite, type Transaction } from "@electric-sql/pglite";

const SUPABASE_STAND_IN = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
  $$;
  grant usage on schema auth, public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  create publication supabase_realtime;
`;

const OWNER = "00000000-0000-0000-0000-00000000000a";
const TRUSTED = "00000000-0000-0000-0000-00000000000b";
const GUEST = "00000000-0000-0000-0000-00000000000c";
const OUTSIDER = "00000000-0000-0000-0000-00000000000d";
const OTHER_OWNER = "00000000-0000-0000-0000-00000000000e";
const HOME = "10000000-0000-0000-0000-000000000001";
const OTHER_HOME = "10000000-0000-0000-0000-000000000002";
const ACCOUNT = "20000000-0000-0000-0000-000000000001";
const CATEGORY = "30000000-0000-0000-0000-000000000001";

const TABLES = [
  "budget_accounts",
  "budget_categories",
  "budget_transactions",
  "budget_recurring_bills",
  "budget_savings_goals",
  "budget_account_balances",
];

async function setup() {
  const db = new PGlite();
  await db.exec(SUPABASE_STAND_IN);
  const dir = new URL("../migrations/", import.meta.url);
  for (const file of readdirSync(dir).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8"));
  }
  await db.exec(`
    insert into auth.users (id, email) values
      ('${OWNER}', 'owner@x'), ('${TRUSTED}', 'trusted@x'), ('${GUEST}', 'guest@x'),
      ('${OUTSIDER}', 'outsider@x'), ('${OTHER_OWNER}', 'other@x');
    insert into households (id, name) values ('${HOME}', 'Home'), ('${OTHER_HOME}', 'Next door');
    insert into household_members (household_id, profile_id, role) values
      ('${HOME}', '${OWNER}', 'owner'), ('${HOME}', '${TRUSTED}', 'trusted'),
      ('${HOME}', '${GUEST}', 'guest'), ('${OTHER_HOME}', '${OTHER_OWNER}', 'owner');
    insert into budget_accounts (id, household_id, name, type) values
      ('${ACCOUNT}', '${HOME}', 'Everyday', 'checking');
    insert into budget_categories (id, household_id, name, type) values
      ('${CATEGORY}', '${HOME}', 'Groceries', 'expense');
    insert into budget_transactions (household_id, account_id, category_id, date, amount, description, created_by)
      values ('${HOME}', '${ACCOUNT}', '${CATEGORY}', '2026-10-18', -84.20, 'Woolworths', '${OWNER}');
    insert into budget_recurring_bills (household_id, name, amount, recurrence_rule, next_due)
      values ('${HOME}', 'Electricity', 210, 'FREQ=MONTHLY;BYMONTHDAY=15', '2026-11-15');
    insert into budget_savings_goals (household_id, name, target_amount)
      values ('${HOME}', 'Holiday', 5000);
  `);
  return db;
}

/** Runs sql as a signed-in user (or anon when user is null), then rolls back. */
async function as<T>(
  db: PGlite,
  user: string | null,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  let result: T;
  await db
    .transaction(async (tx) => {
      if (user) {
        await tx.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({ sub: user, role: "authenticated" }),
        ]);
      }
      await tx.exec(`set local role ${user ? "authenticated" : "anon"}`);
      result = await fn(tx);
      await tx.rollback();
    });
  return result!;
}

const count = async (tx: Transaction, table: string) =>
  Number((await tx.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0].n);

test("ledger: owners see everything, nobody else sees anything", async () => {
  const db = await setup();
  for (const table of TABLES) {
    assert.equal(await as(db, OWNER, (tx) => count(tx, table)), 1, `owner, ${table}`);
    for (const [who, id] of [
      ["trusted", TRUSTED],
      ["guest", GUEST],
      ["outsider", OUTSIDER],
      ["other household's owner", OTHER_OWNER],
      ["anon", null],
    ] as const) {
      assert.equal(await as(db, id, (tx) => count(tx, table)), 0, `${who}, ${table}`);
    }
  }
});

test("ledger: non-owners can't write", async () => {
  const db = await setup();
  for (const id of [TRUSTED, GUEST]) {
    await assert.rejects(
      as(db, id, (tx) =>
        tx.query(
          `insert into budget_accounts (household_id, name, type) values ('${HOME}', 'Sneaky', 'cash')`,
        ),
      ),
      /row-level security/,
    );
    const changed = await as(db, id, async (tx) => {
      const u = await tx.query("update budget_transactions set amount = -1");
      const d = await tx.query("delete from budget_savings_goals");
      return (u.affectedRows ?? 0) + (d.affectedRows ?? 0);
    });
    assert.equal(changed, 0);
  }
});

test("ledger: owners write within their own household only", async () => {
  const db = await setup();
  const mine = await as(db, OWNER, async (tx) => {
    const r = await tx.query<{ created_by: string }>(
      `insert into budget_transactions (household_id, account_id, date, amount, description)
       values ('${HOME}', '${ACCOUNT}', '2026-10-19', 1500, 'Pay') returning created_by`,
    );
    return r.rows[0].created_by;
  });
  assert.equal(mine, OWNER, "created_by defaults to the signed-in user");

  await assert.rejects(
    as(db, OWNER, (tx) =>
      tx.query(
        `insert into budget_accounts (household_id, name, type) values ('${OTHER_HOME}', 'Theirs', 'cash')`,
      ),
    ),
    /row-level security/,
  );
  // Another household's owner can't hang a transaction off our account.
  await assert.rejects(
    as(db, OTHER_OWNER, (tx) =>
      tx.query(
        `insert into budget_transactions (household_id, account_id, date, amount, description)
         values ('${OTHER_HOME}', '${ACCOUNT}', '2026-10-19', -5, 'Borrowed')`,
      ),
    ),
    /foreign key/,
  );
});

test("ledger: balance is the opening balance plus transactions", async () => {
  const db = await setup();
  const balance = await as(db, OWNER, async (tx) => {
    await tx.query(`update budget_accounts set opening_balance = 1000`);
    await tx.query(`insert into budget_transactions (household_id, account_id, date, amount)
                    values ('${HOME}', '${ACCOUNT}', '2026-10-19', 15.70)`);
    return (await tx.query<{ balance: string }>("select balance from budget_account_balances")).rows;
  });
  assert.deepEqual(balance, [{ balance: "931.50" }]);
});

test("ledger: constraints", async () => {
  const db = await setup();
  const insert = (sql: string) => as(db, OWNER, (tx) => tx.query(sql));
  await assert.rejects(
    insert(`insert into budget_savings_goals (household_id, name, target_amount) values ('${HOME}', 'X', 0)`),
    /check constraint/,
  );
  await assert.rejects(
    insert(`insert into budget_transactions (household_id, account_id, date, amount, description)
            values ('${HOME}', '${ACCOUNT}', '2026-10-19', 0, 'Nothing')`),
    /check constraint/,
  );
  // Accounts and categories with history can't be deleted (categories get archived instead).
  await assert.rejects(insert(`delete from budget_accounts where id = '${ACCOUNT}'`), /foreign key/);
  await assert.rejects(insert(`delete from budget_categories where id = '${CATEGORY}'`), /foreign key/);
  // Quick-add needs no description.
  await insert(`insert into budget_transactions (household_id, account_id, category_id, date, amount)
                values ('${HOME}', '${ACCOUNT}', '${CATEGORY}', '2026-10-19', -5)`);
});
