-- Migration: ledger_claude
-- Claude (through the MCP server) suggests categories for merchants the
-- Ledger doesn't know yet. A suggestion waits on the Reconcile page like any
-- other, and only an Owner's confirmation teaches the Ledger.

-- Claude's suggestion for one merchant: a category, or null for money moved
-- to or from the household's own accounts. Only uncategorised transactions
-- and Claude's earlier suggestions change; the Ledger's own memory wins.
-- Nothing is remembered. Returns how many transactions changed.
-- security invoker: the caller's row-level security applies.
create function public.budget_suggest_for(p_household uuid, p_merchant text, p_category uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed integer;
begin
  update public.budget_transactions t
     set category_id = p_category,
         transfer_id = case when p_category is null then coalesce(t.transfer_id, gen_random_uuid()) end,
         suggested_by = 'claude'
   where t.household_id = p_household
     and t.merchant = p_merchant
     and t.goal_id is null
     and (t.suggested_by = 'claude'
          or (t.suggested_by is null and t.category_id is null and t.transfer_id is null));
  get diagnostics changed = row_count;
  return changed;
end;
$$;

-- The Reconcile page's list, now saying who suggested what. suggestion is a
-- category id, 'transfer' for the household's own accounts, or null.
drop view public.budget_pending;
create view public.budget_pending
  with (security_invoker = true) as
select
  t.household_id,
  t.merchant,
  count(*)::int as transactions,
  sum(t.amount) as total,
  min(t.date) as first,
  max(t.date) as last,
  (array_agg(t.description order by t.date desc))[1] as example,
  case
    when p.merchant is not null then 'payee'
    when bool_or(t.suggested_by = 'claude') then 'claude'
  end as suggested_by,
  case
    when p.merchant is not null then coalesce(p.category_id::text, 'transfer')
    when bool_or(t.suggested_by = 'claude') then coalesce(
      mode() within group (order by t.category_id::text) filter (where t.suggested_by = 'claude'),
      'transfer')
  end as suggestion
from public.budget_transactions t
left join public.budget_payees p on p.household_id = t.household_id and p.merchant = t.merchant
where t.merchant is not null
  and t.goal_id is null
  and (t.suggested_by is not null or (t.category_id is null and t.transfer_id is null))
group by t.household_id, t.merchant, p.merchant, p.category_id;
