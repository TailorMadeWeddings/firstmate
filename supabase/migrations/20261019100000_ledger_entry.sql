-- Migration: ledger_entry (KID-30, KID-31)
-- What the entry screens need on top of ledger_schema.

-- Categories are archived, not deleted, once they have transactions:
-- archived ones drop out of entry forms but stay in history and reports.
alter table public.budget_categories add column archived_at timestamptz;

alter table public.budget_transactions
  drop constraint budget_transactions_category_id_household_id_fkey,
  add constraint budget_transactions_category_id_household_id_fkey
    foreign key (category_id, household_id)
    references public.budget_categories (id, household_id);

-- Quick-add is just amount, category and account.
alter table public.budget_transactions alter column description drop not null;

-- Current balance per account. security_invoker makes the view obey the
-- tables' row-level security, so it's Owners only too.
create view public.budget_account_balances
  with (security_invoker = true) as
select a.id, a.household_id, a.opening_balance + coalesce(sum(t.amount), 0) as balance
from public.budget_accounts a
left join public.budget_transactions t on t.account_id = a.id
group by a.id;

-- Starting categories for every household (KID-31).
insert into public.budget_categories (household_id, name, type)
select h.id, c.name, c.type
from public.households h
cross join (values
  ('Salary', 'income'), ('Other', 'income'),
  ('Groceries', 'expense'), ('Utilities', 'expense'), ('Mortgage/Rent', 'expense'),
  ('Insurance', 'expense'), ('Transport', 'expense'), ('Childcare', 'expense'),
  ('Eating Out', 'expense'), ('Entertainment', 'expense'), ('Health', 'expense'),
  ('Personal', 'expense'), ('Travel', 'expense'), ('Misc', 'expense')
) as c(name, type)
on conflict do nothing;
