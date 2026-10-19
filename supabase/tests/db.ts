// Shared by the database tests: every migration run in PGlite (real
// Postgres in-process, no Docker) behind a small stand-in for Supabase's auth
// schema, plus a household with an owner, a trusted member, a guest, an
// outsider, and a second household next door.
//
// ponytail: the auth schema below is a stand-in for Supabase's (auth.uid()
// reads the JWT claims the same way). If a migration starts relying on more
// of Supabase, extend the stand-in.
import { readdirSync, readFileSync } from "node:fs";
import { PGlite, type Transaction } from "@electric-sql/pglite";

export const SUPABASE_STAND_IN = `
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

export const OWNER = "00000000-0000-0000-0000-00000000000a";
export const TRUSTED = "00000000-0000-0000-0000-00000000000b";
export const GUEST = "00000000-0000-0000-0000-00000000000c";
export const OUTSIDER = "00000000-0000-0000-0000-00000000000d";
export const OTHER_OWNER = "00000000-0000-0000-0000-00000000000e";
export const HOME = "10000000-0000-0000-0000-000000000001";
export const OTHER_HOME = "10000000-0000-0000-0000-000000000002";
export const ACCOUNT = "20000000-0000-0000-0000-000000000001";
export const CATEGORY = "30000000-0000-0000-0000-000000000001";
export const BILL = "40000000-0000-0000-0000-000000000001";
export const GOAL = "50000000-0000-0000-0000-000000000001";


export async function setup() {
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
    insert into budget_recurring_bills (id, household_id, name, amount, recurrence_rule, next_due, account_id, category_id)
      values ('${BILL}', '${HOME}', 'Electricity', 210, 'FREQ=MONTHLY;BYMONTHDAY=15', '2026-11-15', '${ACCOUNT}', '${CATEGORY}');
    insert into budget_savings_goals (id, household_id, name, target_amount, starting_amount)
      values ('${GOAL}', '${HOME}', 'Holiday', 5000, 400);
    insert into budget_limits (category_id, household_id, monthly_amount)
      values ('${CATEGORY}', '${HOME}', 900);
  `);
  return db;
}

/** Runs sql as a signed-in user (or anon when user is null), then rolls back. */
export async function as<T>(
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

export const count = async (tx: Transaction, table: string) =>
  Number((await tx.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0].n);

