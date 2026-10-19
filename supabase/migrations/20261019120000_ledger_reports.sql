-- Migration: ledger_reports (KID-35)
-- Money in and out per month and category, for the reports page. Totalling
-- in the database keeps the page to a few hundred rows a year instead of
-- every transaction. Goal contributions are savings, not spending, so they
-- are left out. security_invoker: Owners only, like the tables.
create view public.budget_monthly_totals
  with (security_invoker = true) as
select
  household_id,
  date_trunc('month', date)::date as month,
  category_id,
  coalesce(sum(amount) filter (where amount > 0), 0) as money_in,
  coalesce(-sum(amount) filter (where amount < 0), 0) as money_out,
  count(*)::int as transactions
from public.budget_transactions
where goal_id is null
group by household_id, date_trunc('month', date), category_id;
