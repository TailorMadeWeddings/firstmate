// The Ledger's access rules: Owners of the household see and change
// everything, nobody else sees anything. Setup lives in db.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Transaction } from "@electric-sql/pglite";
import {
  ACCOUNT,
  BILL,
  CATEGORY,
  GOAL,
  GUEST,
  HOME,
  OTHER_HOME,
  OTHER_OWNER,
  OUTSIDER,
  OWNER,
  TRUSTED,
  as,
  count,
  setup,
} from "./db.ts";

const TABLES = [
  "budget_accounts",
  "budget_categories",
  "budget_transactions",
  "budget_recurring_bills",
  "budget_savings_goals",
  "budget_account_balances",
  "budget_goal_progress",
  "budget_monthly_totals",
  "budget_limits",
];

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

test("ledger: paying a bill records it once and moves the due date on", async () => {
  const db = await setup();
  const pay = (tx: Transaction) =>
    tx.query(`select budget_pay_bill('${BILL}', '2026-11-15', '2026-12-15', '2026-11-14', 223.40)`);
  const after = await as(db, OWNER, async (tx) => {
    await pay(tx);
    const bill = (await tx.query("select next_due::text, last_paid::text from budget_recurring_bills")).rows;
    const paid = (await tx.query("select amount::text, description from budget_transactions where description = 'Electricity'")).rows;
    // The second tap of a double click finds the bill already moved on.
    const again = await tx.query("savepoint s").then(() => pay(tx)).then(() => "paid twice", (e: Error) => e.message);
    return { bill, paid, again };
  });
  assert.deepEqual(after.bill, [{ next_due: "2026-12-15", last_paid: "2026-11-14" }]);
  assert.deepEqual(after.paid, [{ amount: "-223.40", description: "Electricity" }]);
  assert.match(after.again, /already paid/);
  // Non-owners can't see the bill, so can't pay it.
  await assert.rejects(as(db, TRUSTED, pay), /already paid/);
});

test("ledger: goal progress is the starting amount plus contributions", async () => {
  const db = await setup();
  const saved = await as(db, OWNER, async (tx) => {
    await tx.query(`insert into budget_transactions (household_id, account_id, goal_id, date, amount)
                    values ('${HOME}', '${ACCOUNT}', '${GOAL}', '2026-10-19', 250)`);
    return (await tx.query<{ saved: string }>("select saved::text from budget_goal_progress")).rows;
  });
  assert.deepEqual(saved, [{ saved: "650.00" }]);
  await assert.rejects(
    as(db, OWNER, async (tx) => {
      await tx.query(`insert into budget_transactions (household_id, account_id, goal_id, date, amount)
                      values ('${HOME}', '${ACCOUNT}', '${GOAL}', '2026-10-19', 250)`);
      await tx.query(`delete from budget_savings_goals where id = '${GOAL}'`);
    }),
    /foreign key/,
  );
});

test("ledger: monthly totals split money in and out, and skip goal savings", async () => {
  const db = await setup();
  const rows = await as(db, OWNER, async (tx) => {
    await tx.query(`insert into budget_transactions (household_id, account_id, category_id, date, amount) values
      ('${HOME}', '${ACCOUNT}', '${CATEGORY}', '2026-10-02', -15.80),
      ('${HOME}', '${ACCOUNT}', '${CATEGORY}', '2026-10-31', 4.20),
      ('${HOME}', '${ACCOUNT}', null, '2026-09-30', 3000)`);
    await tx.query(`insert into budget_transactions (household_id, account_id, goal_id, date, amount)
                    values ('${HOME}', '${ACCOUNT}', '${GOAL}', '2026-10-05', 500)`);
    return (
      await tx.query(
        "select month::text, category_id, money_in::text, money_out::text, transactions from budget_monthly_totals order by month, category_id",
      )
    ).rows;
  });
  assert.deepEqual(rows, [
    { month: "2026-09-01", category_id: null, money_in: "3000.00", money_out: "0", transactions: 1 },
    { month: "2026-10-01", category_id: CATEGORY, money_in: "4.20", money_out: "100.00", transactions: 3 },
  ]);
});

test("kitchen PIN hashes are invisible to every signed-in user", async () => {
  const db = await setup();
  await db.exec(`insert into kitchen_pins (profile_id, household_id, pin_hash) values ('${OWNER}', '${HOME}', 'salt:hash')`);
  for (const id of [OWNER, TRUSTED, OUTSIDER, null]) {
    assert.equal(await as(db, id, (tx) => count(tx, "kitchen_pins")), 0);
    await assert.rejects(
      as(db, id, (tx) =>
        tx.query(`insert into kitchen_pins (profile_id, household_id, pin_hash) values ('${TRUSTED}', '${HOME}', 'x')`),
      ),
      /row-level security/,
    );
  }
});

test("budget limits: positive, one per category, gone with their category", async () => {
  const db = await setup();
  const run = (sql: string) => as(db, OWNER, (tx) => tx.query(sql));
  await assert.rejects(run(`update budget_limits set monthly_amount = 0`), /check constraint/);
  await assert.rejects(
    run(`insert into budget_limits (category_id, household_id, monthly_amount) values ('${CATEGORY}', '${HOME}', 50)`),
    /duplicate key/,
  );
  // Another household's owner can't put a limit on one of our categories.
  const unbudgeted = "30000000-0000-0000-0000-000000000002";
  await db.exec(`insert into budget_categories (id, household_id, name, type) values ('${unbudgeted}', '${HOME}', 'Fuel', 'expense')`);
  await assert.rejects(
    as(db, OTHER_OWNER, (tx) =>
      tx.query(`insert into budget_limits (category_id, household_id, monthly_amount) values ('${unbudgeted}', '${OTHER_HOME}', 50)`),
    ),
    /foreign key/,
  );
  const left = await as(db, OWNER, async (tx) => {
    await tx.query(`delete from budget_transactions where category_id = '${CATEGORY}'`);
    await tx.query(`delete from budget_categories where id = '${CATEGORY}'`);
    return count(tx, "budget_limits");
  });
  assert.equal(left, 0);
});

test("transfers: one step, balances move, reports ignore them", async () => {
  const db = await setup();
  const SAVINGS = "20000000-0000-0000-0000-000000000002";
  await db.exec(`insert into budget_accounts (id, household_id, name, type) values ('${SAVINGS}', '${HOME}', 'Savings', 'savings')`);
  const result = await as(db, OWNER, async (tx) => {
    const id = (
      await tx.query<{ id: string }>(
        `select budget_save_transfer(null, '${ACCOUNT}', '${SAVINGS}', 500, '2026-10-19', 'Top up') as id`,
      )
    ).rows[0].id;
    const balances = (await tx.query("select id, balance::text from budget_account_balances order by id")).rows;
    const outOct = (await tx.query("select coalesce(sum(money_out), 0)::text as out, coalesce(sum(money_in), 0)::text as in from budget_monthly_totals where month = '2026-10-01'")).rows;
    // Editing replaces both halves together.
    await tx.query(`select budget_save_transfer('${id}'::uuid, '${SAVINGS}', '${ACCOUNT}', 120, '2026-10-20')`);
    const legs = (await tx.query("select account_id, amount::text from budget_transactions where transfer_id is not null order by amount")).rows;
    return { balances, outOct, legs };
  });
  assert.deepEqual(result.balances, [
    { id: ACCOUNT, balance: "-584.20" },
    { id: SAVINGS, balance: "500.00" },
  ]);
  // Only the fixture's -84.20 grocery shop counts; the transfer doesn't.
  assert.deepEqual(result.outOct, [{ out: "84.20", in: "0" }]);
  assert.deepEqual(result.legs, [
    { account_id: SAVINGS, amount: "-120.00" },
    { account_id: ACCOUNT, amount: "120.00" },
  ]);

  const save = (who: string | null, from: string, to: string, amount: number) =>
    as(db, who, (tx) => tx.query(`select budget_save_transfer(null, '${from}', '${to}', ${amount}, '2026-10-19')`));
  await assert.rejects(save(OWNER, ACCOUNT, ACCOUNT, 5), /different accounts/);
  await assert.rejects(save(OWNER, ACCOUNT, SAVINGS, 0), /more than 0/);
  // Non-owners can't see the accounts, so can't move money.
  await assert.rejects(save(TRUSTED, ACCOUNT, SAVINGS, 5), /account not found/);
  // Another household's owner can't send money into our account.
  const THEIRS = "20000000-0000-0000-0000-000000000003";
  await db.exec(`insert into budget_accounts (id, household_id, name, type) values ('${THEIRS}', '${OTHER_HOME}', 'Theirs', 'cash')`);
  await assert.rejects(save(OTHER_OWNER, THEIRS, ACCOUNT, 5), /foreign key/);
  // A transfer can't carry a category.
  await assert.rejects(
    as(db, OWNER, (tx) =>
      tx.query(`insert into budget_transactions (household_id, account_id, category_id, date, amount, transfer_id)
                values ('${HOME}', '${ACCOUNT}', '${CATEGORY}', '2026-10-19', -5, gen_random_uuid())`),
    ),
    /check constraint/,
  );
});

test("transfers into a goal count towards it", async () => {
  const db = await setup();
  const SAVINGS = "20000000-0000-0000-0000-000000000002";
  await db.exec(`insert into budget_accounts (id, household_id, name, type) values ('${SAVINGS}', '${HOME}', 'Savings', 'savings')`);
  const saved = await as(db, OWNER, async (tx) => {
    await tx.query(`select budget_save_transfer(null, '${ACCOUNT}', '${SAVINGS}', 250, '2026-10-19', null, '${GOAL}')`);
    return (await tx.query("select saved::text from budget_goal_progress")).rows;
  });
  // 400 already saved + 250 moved in.
  assert.deepEqual(saved, [{ saved: "650.00" }]);
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
