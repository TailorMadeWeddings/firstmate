-- Migration: ledger_payee_report
-- Spending per payee, for finding what to cut. A payee is a merchant, or
-- several merchants an Owner has given the same name ("COLES WARATAH" and
-- "COLES KOTARA" both named "Coles").

alter table public.budget_payees
  add column name text check (name <> '');

-- Each payee's spending between two dates: total, number of transactions,
-- how many different months it was in, and its usual category. Transfers
-- and goal savings aren't spending, and payees that only paid money in are
-- left out. security invoker: Owners only, like the tables.
create function public.budget_payee_spending(p_from date, p_to date)
returns table (
  payee text, merchants text[], category_id uuid, spent numeric,
  transactions integer, months integer, first date, last date
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(p.name, t.merchant),
    array_agg(distinct t.merchant),
    mode() within group (order by t.category_id),
    -sum(t.amount),
    count(*)::int,
    count(distinct date_trunc('month', t.date))::int,
    min(t.date),
    max(t.date)
  from public.budget_transactions t
  left join public.budget_payees p on p.household_id = t.household_id and p.merchant = t.merchant
  where t.date between p_from and p_to
    and t.merchant is not null
    and t.transfer_id is null
    and t.goal_id is null
  group by t.household_id, coalesce(p.name, t.merchant)
  having sum(t.amount) < 0
  order by -sum(t.amount) desc
$$;
