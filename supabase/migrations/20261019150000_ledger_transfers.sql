-- Migration: ledger_transfers
-- Money moved between the household's own accounts (paying off the card,
-- topping up savings). A transfer is a pair of transactions sharing a
-- transfer_id: money out of one account, the same amount into another.
-- Balances need nothing new; reports and budgets leave transfers out.

alter table public.budget_transactions
  add column transfer_id uuid,
  -- A transfer isn't spending or income, so it never has a category.
  add constraint budget_transactions_transfer_uncategorised
    check (transfer_id is null or category_id is null);

create index budget_transactions_transfer on public.budget_transactions (transfer_id)
  where transfer_id is not null;

-- Same view as before, now also leaving out transfers.
create or replace view public.budget_monthly_totals
  with (security_invoker = true) as
select
  household_id,
  date_trunc('month', date)::date as month,
  category_id,
  coalesce(sum(amount) filter (where amount > 0), 0) as money_in,
  coalesce(-sum(amount) filter (where amount < 0), 0) as money_out,
  count(*)::int as transactions
from public.budget_transactions
where goal_id is null and transfer_id is null
group by household_id, date_trunc('month', date), category_id;

-- Creates a transfer, or replaces an existing one (p_transfer), as one
-- step: both halves are written together or not at all. p_goal tags the
-- money arriving, for savings put towards a goal from another account.
-- security invoker: the caller's row-level security applies (Owners only),
-- and the account foreign keys keep both sides in one household.
create function public.budget_save_transfer(
  p_transfer uuid, p_from uuid, p_to uuid, p_amount numeric, p_date date,
  p_note text default null, p_goal uuid default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  home uuid;
  id uuid := coalesce(p_transfer, gen_random_uuid());
begin
  if p_from = p_to then
    raise exception 'pick two different accounts' using errcode = 'P0004';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be more than 0' using errcode = 'P0005';
  end if;
  select household_id into home from public.budget_accounts where budget_accounts.id = p_from;
  if home is null then
    raise exception 'account not found' using errcode = 'P0006';
  end if;
  if p_transfer is not null then
    delete from public.budget_transactions where transfer_id = p_transfer;
    if not found then
      raise exception 'transfer not found' using errcode = 'P0006';
    end if;
  end if;
  insert into public.budget_transactions (household_id, account_id, date, amount, description, transfer_id, goal_id)
  values
    (home, p_from, p_date, -p_amount, p_note, id, null),
    (home, p_to, p_date, p_amount, p_note, id, p_goal);
  return id;
end;
$$;
