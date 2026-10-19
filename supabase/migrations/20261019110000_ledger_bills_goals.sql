-- Migration: ledger_bills_goals (KID-32, KID-33)

-- ============================================================
-- Recurring bills
-- ============================================================
-- Auto-pay is a reminder that the bank pays it; with no bank feed someone
-- still confirms each payment.
alter table public.budget_recurring_bills
  add column autopay boolean not null default false;

-- Records a bill payment and moves the bill to its next due date, together.
-- p_due must match the bill's current next_due, so paying twice (a double
-- click, two phones) fails instead of recording the payment twice. The app
-- works out p_next from the bill's recurrence rule.
-- security invoker: the caller's row-level security applies (Owners only).
create function public.budget_pay_bill(
  p_bill uuid, p_due date, p_next date, p_paid_on date, p_amount numeric
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  bill public.budget_recurring_bills;
  paid uuid;
begin
  if p_next <= p_due then
    raise exception 'next due date must be after this one';
  end if;
  update public.budget_recurring_bills
     set next_due = p_next, last_paid = p_paid_on
   where id = p_bill and next_due = p_due
  returning * into bill;
  if bill.id is null then
    raise exception 'bill not found, or already paid' using errcode = 'P0002';
  end if;
  if bill.account_id is null or bill.category_id is null then
    raise exception 'bill needs an account and a category' using errcode = 'P0003';
  end if;
  insert into public.budget_transactions (household_id, account_id, category_id, date, amount, description)
  values (bill.household_id, bill.account_id, bill.category_id, p_paid_on, -abs(p_amount), bill.name)
  returning id into paid;
  return paid;
end;
$$;

-- ============================================================
-- Savings goals
-- ============================================================
-- Progress = what was already saved when the goal was set up, plus the
-- transactions tagged with the goal. Nothing has been stored yet, so the
-- rename is safe.
alter table public.budget_savings_goals rename column current_amount to starting_amount;
alter table public.budget_savings_goals
  add column completed_at timestamptz,
  add unique (id, household_id);

-- A goal with contributions can't be deleted (mark it complete instead),
-- the same rule as categories.
alter table public.budget_transactions
  add column goal_id uuid,
  add foreign key (goal_id, household_id)
    references public.budget_savings_goals (id, household_id);

create index budget_transactions_goal on public.budget_transactions (goal_id)
  where goal_id is not null;

create view public.budget_goal_progress
  with (security_invoker = true) as
select g.id, g.household_id, g.starting_amount + coalesce(sum(t.amount), 0) as saved
from public.budget_savings_goals g
left join public.budget_transactions t on t.goal_id = g.id
group by g.id;
