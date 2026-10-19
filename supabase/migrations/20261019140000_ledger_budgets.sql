-- Migration: ledger_budgets
-- A monthly spending limit per expense category. Sub-category spending
-- counts towards its parent, so the app sets limits on top-level
-- categories. Owners only, like the rest of the Ledger.
create table public.budget_limits (
  category_id   uuid primary key,
  household_id  uuid not null references public.households(id) on delete cascade,
  monthly_amount numeric(12,2) not null check (monthly_amount > 0),
  updated_at    timestamptz not null default now(),
  -- Deleting a category (only possible without transactions) drops its limit.
  foreign key (category_id, household_id)
    references public.budget_categories (id, household_id)
    on delete cascade
);

alter table public.budget_limits enable row level security;

create policy "Owners have full access to budget limits"
  on public.budget_limits for all to authenticated
  using (public.is_owner_of(household_id))
  with check (public.is_owner_of(household_id));
