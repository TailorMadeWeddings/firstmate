-- Migration: ledger_schema (KID-29)
-- The Ledger: accounts, categories, transactions, recurring bills and
-- savings goals. Owners only: Trusted and Guest members get nothing, not
-- even read access.
--
-- Money is numeric(12,2) dollars, exact, so sums are done in SQL.
-- Every row carries household_id, and references between Ledger tables
-- include it, so a row can never point at another household's account
-- or category.

-- ============================================================
-- budget_accounts
-- ============================================================
create table public.budget_accounts (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households(id) on delete cascade,
  name             text not null,
  type             text not null check (type in ('checking', 'savings', 'credit', 'cash')),
  -- Balance when tracking started. Current balance = opening_balance plus
  -- the account's transactions, so it can never drift out of step.
  opening_balance  numeric(12,2) not null default 0,
  currency         text not null default 'AUD' check (currency ~ '^[A-Z]{3}$'),
  created_at       timestamptz not null default now(),
  unique (id, household_id)
);
comment on table public.budget_accounts is
  'Bank accounts, cards and cash. Balance is derived: opening_balance + sum(transactions).';

-- ============================================================
-- budget_categories: one level of nesting via parent_category_id
-- ============================================================
create table public.budget_categories (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references public.households(id) on delete cascade,
  name                text not null,
  parent_category_id  uuid,
  type                text not null check (type in ('income', 'expense')),
  color               text,
  icon                text,
  created_at          timestamptz not null default now(),
  unique (id, household_id),
  unique nulls not distinct (household_id, parent_category_id, name),
  -- Deleting a parent leaves its children as top-level categories.
  foreign key (parent_category_id, household_id)
    references public.budget_categories (id, household_id)
    on delete set null (parent_category_id)
);

-- ============================================================
-- budget_transactions: amount is signed, negative = money out
-- ============================================================
create table public.budget_transactions (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  account_id    uuid not null,
  category_id   uuid,
  date          date not null,
  amount        numeric(12,2) not null check (amount <> 0),
  description   text not null,
  notes         text,
  created_by    uuid not null default auth.uid() references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- An account with transactions can't be deleted (no action), so history
  -- is never lost by accident.
  foreign key (account_id, household_id)
    references public.budget_accounts (id, household_id),
  foreign key (category_id, household_id)
    references public.budget_categories (id, household_id)
    on delete set null (category_id)
);

create index budget_transactions_household_date on public.budget_transactions (household_id, date desc);
create index budget_transactions_account on public.budget_transactions (account_id, date desc);
create index budget_transactions_category on public.budget_transactions (category_id)
  where category_id is not null;

create trigger set_budget_transactions_updated_at
  before update on public.budget_transactions
  for each row execute function public.update_updated_at_column();

-- ============================================================
-- budget_recurring_bills: repeats like Logbook events (RFC 5545 RRULE)
-- ============================================================
create table public.budget_recurring_bills (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households(id) on delete cascade,
  name             text not null,
  amount           numeric(12,2) not null check (amount > 0),
  recurrence_rule  text not null,
  category_id      uuid,
  account_id       uuid,
  next_due         date not null,
  last_paid        date,
  created_at       timestamptz not null default now(),
  foreign key (category_id, household_id)
    references public.budget_categories (id, household_id)
    on delete set null (category_id),
  foreign key (account_id, household_id)
    references public.budget_accounts (id, household_id)
    on delete set null (account_id)
);

create index budget_recurring_bills_due on public.budget_recurring_bills (household_id, next_due);

-- ============================================================
-- budget_savings_goals
-- ============================================================
create table public.budget_savings_goals (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  name            text not null,
  target_amount   numeric(12,2) not null check (target_amount > 0),
  current_amount  numeric(12,2) not null default 0 check (current_amount >= 0),
  target_date     date,
  account_id      uuid,
  created_at      timestamptz not null default now(),
  foreign key (account_id, household_id)
    references public.budget_accounts (id, household_id)
    on delete set null (account_id)
);

-- ============================================================
-- Row-level security: Owners of the household, nobody else.
-- ============================================================
alter table public.budget_accounts        enable row level security;
alter table public.budget_categories      enable row level security;
alter table public.budget_transactions    enable row level security;
alter table public.budget_recurring_bills enable row level security;
alter table public.budget_savings_goals   enable row level security;

create policy "Owners have full access to accounts"
  on public.budget_accounts for all to authenticated
  using (public.is_owner_of(household_id))
  with check (public.is_owner_of(household_id));

create policy "Owners have full access to categories"
  on public.budget_categories for all to authenticated
  using (public.is_owner_of(household_id))
  with check (public.is_owner_of(household_id));

create policy "Owners have full access to transactions"
  on public.budget_transactions for all to authenticated
  using (public.is_owner_of(household_id))
  with check (public.is_owner_of(household_id));

create policy "Owners have full access to recurring bills"
  on public.budget_recurring_bills for all to authenticated
  using (public.is_owner_of(household_id))
  with check (public.is_owner_of(household_id));

create policy "Owners have full access to savings goals"
  on public.budget_savings_goals for all to authenticated
  using (public.is_owner_of(household_id))
  with check (public.is_owner_of(household_id));
