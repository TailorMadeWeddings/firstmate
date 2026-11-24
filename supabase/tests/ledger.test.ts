// The Ledger's access rules: Owners of the household see and change
// everything, nobody else sees anything. Setup lives in db.ts.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { PGlite, type Transaction } from "@electric-sql/pglite";
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
  SUPABASE_STAND_IN,
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

test("payees: the merchant is the description without the noise", async () => {
  const db = await setup();
  const cases = {
    "COLES 1234 NEWTOWN NS AUS Card xx1234 Value Date: 24/07/2026": "COLES NEWTOWN",
    "COLES 1234 NEWTOWN AU": "COLES NEWTOWN",
    "SQ *EXAMPLE CAFE Newtown Nort AU": "EXAMPLE CAFE NEWTOWN NORT",
    "NXT*Example Golf C Newtown NS AUS Card xx1234 Value Date: 21/04/2026": "EXAMPLE GOLF C NEWTOWN",
    "BUNNINGS OLDTOWN 5678 OLDTOWN NSW AU": "BUNNINGS OLDTOWN OLDTOWN",
    "EXAMPLE STREAMING DENVER CO USA Card xx1234 USD 6.00 Value Date: 10/07/2026": "EXAMPLE STREAMING DENVER CO",
    "Transfer from xx5678 CommBank app": "TRANSFER FROM XX5678",
    "Transfer To Pat Example CommBank App rent pt 1": "TRANSFER TO PAT EXAMPLE",
    "Fast Transfer From SAM SAMPLE to PayID Phone lunch": "FAST TRANSFER FROM SAM SAMPLE",
    "Fast Transfer From SAM SAMPLE dinner": "FAST TRANSFER FROM SAM SAMPLE",
    "Direct Debit 123456 EXAMPLECO Plan 000000012345678": "DIRECT DEBIT EXAMPLECO PLAN",
    "International Transaction Fee Value Date: 09/10/2026": "INTERNATIONAL TRANSACTION FEE",
    "Apple APPLE.COM/BILL ABC1D23E4Fa1": "APPLE APPLE.COM/BILL",
    "123Pin* Chargefox Pty Ltd North Melbour": "CHARGEFOX PTY LTD NORTH MELBOUR",
    "COLES 1234 NEWTOWN 02 AUS Card xx1234 Value Date: 12/03/2026": "COLES NEWTOWN",
    "AMPOL OLDTOWN 12345F OLDTOWN AUS Card xx1234 Value Date: 04/07/2026": "AMPOL OLDTOWN 12345F OLDTOWN",
    // Money coming back files with the payment; a shop called Return keeps its name.
    "Direct Debit 123456 EXAMPLE GYM 7654321-0": "DIRECT DEBIT EXAMPLE GYM",
    "Return 02/01/26 Direct Debit 123456 EXAMPLE GYM 7654321-3": "DIRECT DEBIT EXAMPLE GYM",
    "Return 17/08/26 Direct Debit 123456 EXAMPLE GYM 7654321-12 Value Date: 17/08/2026": "DIRECT DEBIT EXAMPLE GYM",
    "Refund Purchase BUNNINGS OLDTOWN 5678 OLDTOWN NSW AU": "BUNNINGS OLDTOWN OLDTOWN",
    "RETURN AND EARN NEWTOWN AU": "RETURN AND EARN NEWTOWN",
    // References that change every time.
    "Direct Debit 123456 Example Fee 0123456789abcdef01": "DIRECT DEBIT EXAMPLE FEE",
    "ExamplePay P123456789 Sydney AU": "EXAMPLEPAY SYDNEY",
    "7-ELEVEN 1234 NEWTOWN NS AUS": "7-ELEVEN NEWTOWN",
  };
  for (const [description, merchant] of Object.entries(cases)) {
    const r = await db.query<{ m: string }>("select budget_merchant($1) as m", [description]);
    assert.equal(r.rows[0].m, merchant, description);
  }
  assert.equal((await db.query<{ m: null }>("select budget_merchant(null) as m")).rows[0].m, null);
});

test("payees: a confirmed choice covers the merchant, now and on later imports", async () => {
  const db = await setup();
  const SAVINGS = "20000000-0000-0000-0000-000000000002";
  await db.exec(`insert into budget_accounts (id, household_id, name, type) values ('${SAVINGS}', '${HOME}', 'Savings', 'savings')`);
  const imported = (description: string, amount: number) =>
    `insert into budget_transactions (household_id, account_id, date, amount, description)
     values ('${HOME}', '${ACCOUNT}', '2026-10-20', ${amount}, '${description}')`;
  const result = await as(db, OWNER, async (tx) => {
    await tx.query(imported("COLES 1234 NEWTOWN AU", -40));
    await tx.query(imported("COLES 1234 NEWTOWN NS AUS Card xx1234 Value Date: 18/10/2026", -60));
    await tx.query(imported("Transfer to xx5678 CommBank app", -100));
    await tx.query(`select budget_save_transfer(null, '${ACCOUNT}', '${SAVINGS}', 100, '2026-10-20', 'Transfer to xx5678 CommBank app')`);
    const pending = (await tx.query("select merchant, transactions, total::text, suggested_by from budget_pending order by merchant")).rows;

    const learned = (await tx.query<{ n: number }>(`select budget_learn('${HOME}', 'COLES NEWTOWN', '${CATEGORY}', true) as n`)).rows[0].n;
    await tx.query(`select budget_learn('${HOME}', 'TRANSFER TO XX5678', null, true)`);
    const after = (await tx.query("select merchant, category_id, transfer_id is not null as transfer, suggested_by from budget_transactions where merchant is not null order by merchant, amount")).rows;

    // A later import from a known merchant comes in suggested.
    await tx.query(imported("COLES 1234 NEWTOWN AU", -25));
    await tx.query(imported("Transfer to xx5678 CommBank app", -50));
    const later = (await tx.query("select merchant, category_id, transfer_id is not null as transfer, suggested_by from budget_transactions where amount in (-25, -50) order by amount")).rows;
    const waiting = (await tx.query("select merchant, suggested_by, suggestion from budget_pending order by merchant")).rows;
    const spent = (await tx.query("select sum(money_out)::text as out from budget_monthly_totals")).rows;
    return { pending, learned, after, later, waiting, spent };
  });
  assert.deepEqual(result.pending, [
    { merchant: "COLES NEWTOWN", transactions: 2, total: "-100.00", suggested_by: null },
    // The real two-sided transfer isn't waiting; only the imported one is.
    { merchant: "TRANSFER TO XX5678", transactions: 1, total: "-100.00", suggested_by: null },
  ]);
  assert.equal(result.learned, 2);
  assert.deepEqual(result.after, [
    { merchant: "COLES NEWTOWN", category_id: CATEGORY, transfer: false, suggested_by: null },
    { merchant: "COLES NEWTOWN", category_id: CATEGORY, transfer: false, suggested_by: null },
    // Both halves of the real transfer (same note), untouched, and the imported one.
    { merchant: "TRANSFER TO XX5678", category_id: null, transfer: true, suggested_by: null },
    { merchant: "TRANSFER TO XX5678", category_id: null, transfer: true, suggested_by: null },
    { merchant: "TRANSFER TO XX5678", category_id: null, transfer: true, suggested_by: null },
    { merchant: "WOOLWORTHS", category_id: CATEGORY, transfer: false, suggested_by: null },
  ]);
  assert.deepEqual(result.later, [
    { merchant: "TRANSFER TO XX5678", category_id: null, transfer: true, suggested_by: "payee" },
    { merchant: "COLES NEWTOWN", category_id: CATEGORY, transfer: false, suggested_by: "payee" },
  ]);
  assert.deepEqual(result.waiting, [
    { merchant: "COLES NEWTOWN", suggested_by: "payee", suggestion: CATEGORY },
    { merchant: "TRANSFER TO XX5678", suggested_by: "payee", suggestion: "transfer" },
  ]);
  // Groceries: 84.20 + 40 + 60 + 25. The own-account transfers aren't spending.
  assert.deepEqual(result.spent, [{ out: "209.20" }]);
});

test("payees: owners only", async () => {
  const db = await setup();
  await db.exec(`
    insert into budget_payees (household_id, merchant, category_id) values ('${HOME}', 'COLES NEWTOWN', '${CATEGORY}');
    insert into budget_transactions (household_id, account_id, date, amount, description, created_by)
      values ('${HOME}', '${ACCOUNT}', '2026-10-20', -9, 'ALDI STORES NEWTOWN', '${OWNER}');
  `);
  assert.equal(await as(db, OWNER, (tx) => count(tx, "budget_payees")), 1);
  assert.equal(await as(db, OWNER, (tx) => count(tx, "budget_pending")), 1);
  for (const id of [TRUSTED, GUEST, OUTSIDER, OTHER_OWNER, null]) {
    assert.equal(await as(db, id, (tx) => count(tx, "budget_payees")), 0);
    assert.equal(await as(db, id, (tx) => count(tx, "budget_pending")), 0);
  }
  // Nobody else can teach our Ledger.
  for (const id of [TRUSTED, OTHER_OWNER]) {
    await assert.rejects(
      as(db, id, (tx) => tx.query(`select budget_learn('${HOME}', 'ALDI STORES NEWTOWN', null, true)`)),
      /row-level security/,
    );
  }
});

test("payee spending: per payee, merged by name, without transfers or income", async () => {
  const db = await setup();
  const result = await as(db, OWNER, async (tx) => {
    await tx.query(`insert into budget_transactions (household_id, account_id, category_id, date, amount, description) values
      ('${HOME}', '${ACCOUNT}', '${CATEGORY}', '2026-08-03', -40, 'COLES 1234 NEWTOWN AU'),
      ('${HOME}', '${ACCOUNT}', '${CATEGORY}', '2026-09-03', -60, 'COLES 1234 NEWTOWN AU'),
      ('${HOME}', '${ACCOUNT}', '${CATEGORY}', '2026-09-20', -30, 'COLES 5678 OLDTOWN AU'),
      ('${HOME}', '${ACCOUNT}', '${CATEGORY}', '2026-09-21', 10, 'COLES 5678 OLDTOWN AU'),
      ('${HOME}', '${ACCOUNT}', null, '2026-09-05', 2000, 'Direct Credit 123456 CLIENT'),
      ('${HOME}', '${ACCOUNT}', null, '2026-07-01', -999, 'EXAMPLE GOLF Newtown AU')`);
    await tx.query(`insert into budget_transactions (household_id, account_id, date, amount, description, transfer_id)
                    values ('${HOME}', '${ACCOUNT}', '2026-09-06', -500, 'Transfer to xx5678 CommBank app', gen_random_uuid())`);
    await tx.query(`insert into budget_payees (household_id, merchant, category_id, name) values
      ('${HOME}', 'COLES NEWTOWN', '${CATEGORY}', 'Coles'), ('${HOME}', 'COLES OLDTOWN', '${CATEGORY}', 'Coles')`);
    return (
      await tx.query(
        "select payee, merchants, category_id, spent::text, transactions, months, first::text, last::text from budget_payee_spending('2026-08-01', '2026-10-31')",
      )
    ).rows;
  });
  // The golf is before the range; the client's payment is income; the transfer isn't spending.
  assert.deepEqual(result, [
    {
      payee: "Coles", merchants: ["COLES NEWTOWN", "COLES OLDTOWN"], category_id: CATEGORY,
      spent: "120.00", transactions: 4, months: 2, first: "2026-08-03", last: "2026-09-21",
    },
    {
      payee: "WOOLWORTHS", merchants: ["WOOLWORTHS"], category_id: CATEGORY,
      spent: "84.20", transactions: 1, months: 1, first: "2026-10-18", last: "2026-10-18",
    },
  ]);
  for (const id of [TRUSTED, OTHER_OWNER, null]) {
    const rows = await as(db, id, (tx) => tx.query("select * from budget_payee_spending('2026-01-01', '2026-12-31')"));
    assert.equal(rows.rows.length, 0);
  }
});

test("claude's suggestions wait for an owner, and teach nothing until confirmed", async () => {
  const db = await setup();
  const result = await as(db, OWNER, async (tx) => {
    await tx.query(`insert into budget_transactions (household_id, account_id, date, amount, description) values
      ('${HOME}', '${ACCOUNT}', '2026-10-01', -12, 'SQ *EXAMPLE CAFE Newtown Nort AU'),
      ('${HOME}', '${ACCOUNT}', '2026-10-08', -14, 'SQ *EXAMPLE CAFE Newtown Nort AU'),
      ('${HOME}', '${ACCOUNT}', '2026-10-09', -50, 'Transfer to xx4321 CommBank app'),
      ('${HOME}', '${ACCOUNT}', '2026-10-10', -30, 'COLES 1234 NEWTOWN AU')`);
    // The Ledger already knows Coles; Claude guessing otherwise changes nothing.
    await tx.query(`select budget_learn('${HOME}', 'COLES NEWTOWN', '${CATEGORY}', false)`);
    const n = async (sql: string) => (await tx.query<{ n: number }>(sql)).rows[0].n;
    const cafe = await n(`select budget_suggest_for('${HOME}', 'EXAMPLE CAFE NEWTOWN NORT', '${CATEGORY}') as n`);
    const own = await n(`select budget_suggest_for('${HOME}', 'TRANSFER TO XX4321', null) as n`);
    const coles = await n(`select budget_suggest_for('${HOME}', 'COLES NEWTOWN', null) as n`);
    const pending = (await tx.query("select merchant, transactions, suggested_by, suggestion from budget_pending order by merchant")).rows;
    const remembered = await count(tx, "budget_payees");
    // An owner confirms Claude's guess for the coffee: now it's remembered.
    await tx.query(`select budget_learn('${HOME}', 'EXAMPLE CAFE NEWTOWN NORT', '${CATEGORY}', true)`);
    const afterConfirm = await count(tx, "budget_payees");
    return { cafe, own, coles, pending, remembered, afterConfirm };
  });
  assert.deepEqual([result.cafe, result.own, result.coles], [2, 1, 0]);
  assert.deepEqual(result.pending, [
    { merchant: "COLES NEWTOWN", transactions: 1, suggested_by: "payee", suggestion: CATEGORY },
    { merchant: "EXAMPLE CAFE NEWTOWN NORT", transactions: 2, suggested_by: "claude", suggestion: CATEGORY },
    { merchant: "TRANSFER TO XX4321", transactions: 1, suggested_by: "claude", suggestion: "transfer" },
  ]);
  assert.equal(result.remembered, 1, "only Coles, which an owner chose");
  assert.equal(result.afterConfirm, 2);
  // Another household's owner can't suggest into ours.
  const theirs = await as(db, OTHER_OWNER, (tx) =>
    tx.query<{ n: number }>(`select budget_suggest_for('${HOME}', 'WOOLWORTHS', null) as n`),
  );
  assert.equal(theirs.rows[0].n, 0);
});

test("returns: the migration refiles transactions and carries remembered choices across", async () => {
  // The database as it was before the migration, with choices already made.
  const db = new PGlite();
  await db.exec(SUPABASE_STAND_IN);
  const dir = new URL("../migrations/", import.meta.url);
  const file = "20261125090000_ledger_returns.sql";
  const read = (f: string) => readFileSync(new URL(f, dir), "utf8");
  for (const f of readdirSync(dir).sort()) if (f < file) await db.exec(read(f));
  const [A, B] = ["30000000-0000-0000-0000-00000000000a", "30000000-0000-0000-0000-00000000000b"];
  await db.exec(`
    insert into auth.users (id, email) values ('${OWNER}', 'owner@x');
    insert into households (id, name) values ('${HOME}', 'Home');
    insert into budget_accounts (id, household_id, name, type) values ('${ACCOUNT}', '${HOME}', 'Everyday', 'checking');
    insert into budget_categories (id, household_id, name, type) values ('${A}', '${HOME}', 'Gym', 'expense'), ('${B}', '${HOME}', 'Back', 'income');
    insert into budget_transactions (household_id, account_id, date, amount, description, created_by)
    select '${HOME}', '${ACCOUNT}', '2026-03-02', x.amount, x.description, '${OWNER}' from (values
      (-80, 'Direct Debit 123456 EXAMPLE GYM 7654321-0'),
      (-90, 'Direct Debit 123456 EXAMPLE GYM 7654321-1'),
      (80, 'Return 02/03/26 Direct Debit 123456 EXAMPLE GYM 7654321-0'),
      (-5, 'Direct Debit 123456 OTHERCO PLAN'),
      (5, 'Return 02/03/26 Direct Debit 123456 OTHERCO PLAN'),
      (-60, 'SERVICE NSW 1234'),
      (-12, 'EXAMPLE CAFE Newtown AU')
    ) as x(amount, description);
    insert into budget_payees (household_id, merchant, category_id, name, updated_at) values
      ('${HOME}', 'DIRECT DEBIT EXAMPLE GYM -0', '${B}', null, '2026-01-01'),
      ('${HOME}', 'DIRECT DEBIT EXAMPLE GYM -1', '${A}', 'Gym', '2026-02-01'),
      ('${HOME}', 'RETURN 02/03/26 DIRECT DEBIT OTHERCO PLAN', '${B}', null, '2026-03-03'),
      ('${HOME}', 'SERVICE NSW', '${A}', null, '2026-01-01'),
      ('${HOME}', 'NO LONGER USED', '${A}', null, '2026-01-01');
  `);
  await db.exec(read(file));
  const merchants = (await db.query<{ merchant: string; n: number; total: string }>("select merchant, count(*)::int as n, sum(amount)::text as total from budget_transactions group by 1 order by 1")).rows;
  assert.deepEqual(merchants, [
    { merchant: "DIRECT DEBIT EXAMPLE GYM", n: 3, total: "-90.00" },
    { merchant: "DIRECT DEBIT OTHERCO PLAN", n: 2, total: "0.00" },
    { merchant: "EXAMPLE CAFE NEWTOWN", n: 1, total: "-12.00" },
    { merchant: "SERVICE NSW", n: 1, total: "-60.00" },
  ]);
  // Two choices became one (the latest). The return's choice isn't put on its
  // debits, and choices whose merchant didn't change are left alone.
  const payees = (await db.query("select merchant, category_id, name from budget_payees order by 1")).rows;
  assert.deepEqual(payees, [
    { merchant: "DIRECT DEBIT EXAMPLE GYM", category_id: A, name: "Gym" },
    { merchant: "NO LONGER USED", category_id: A, name: null },
    { merchant: "SERVICE NSW", category_id: A, name: null },
  ]);
});
