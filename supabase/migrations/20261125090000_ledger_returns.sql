-- Migration: ledger_returns
-- A bounced direct debit comes back as "Return 02/03/26 Direct Debit …", with
-- its own date, so each one was a new merchant that never matched its debit.
-- It now shares the debit's merchant, and so its category. References that
-- change every time no longer split a payee either: "1234567-2" (the part
-- after the dash), long hex codes, and a letter and digits ("P123456789").

create or replace function public.budget_merchant(description text) returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  d text := description;
begin
  -- card purchases: "… Card xx1234 USD 6.00 Value Date: 10/07/2026"
  d := regexp_replace(d, '\s+(Card xx\d+|Value Date:).*$', '', 'i');
  -- money coming back: file it with what it's for. Only a dated Return, so
  -- a shop whose name starts with "Return" keeps it.
  d := regexp_replace(d, '^(Return \d\d/\d\d/\d\d|Refund Purchase)\s+', '', 'i');
  -- transfers: the note after "CommBank App" differs every time
  d := regexp_replace(d, '\s+(CommBank App|PayID Phone|CREDIT TO ACCOUNT)\M.*$', '', 'i');
  -- "Fast Transfer From" has no marker before its note; keep two words of the name
  d := regexp_replace(d, '^(Fast Transfer From \S+ \S+).*$', '\1', 'i');
  -- Apple: a reference per bill
  d := regexp_replace(d, '^(Apple APPLE\.COM/BILL)\s.*$', '\1', 'i');
  -- payment processors: "SQ *", "NXT*", "SMP*", and Chargefox's "123Pin*"
  d := regexp_replace(d, '^(\d+PIN|[A-Z]{2,4}) ?\* ?', '', 'i');
  -- store and reference numbers, with any "-2" after them, but not account
  -- numbers like xx1234
  d := regexp_replace(d, '\m\d{3,}(-\d{1,3})?\M', '', 'g');
  -- references: "P123456789", and long hex codes
  d := regexp_replace(d, '\m([A-Z]\d{6,}|[0-9A-F]{12,})\M', '', 'gi');
  -- state and country on the end
  d := regexp_replace(d, '(\s+(NSW?|NSWAU|AUS?|USA))+$', '', 'i');
  -- a stray "02" left on the end
  d := regexp_replace(d, '\s+\d{1,2}$', '');
  return nullif(upper(trim(regexp_replace(d, '\s+', ' ', 'g'))), '');
end;
$$;

-- Remembered choices move to the merchants' new names. The new name is read
-- from the transactions, as cleaning up an already clean name can change it.
-- Several old names can become one: the latest choice moves, and one already
-- remembered under the new name stands. What was chosen for money coming back
-- says nothing about the payment itself, so that isn't carried over.
insert into public.budget_payees (household_id, merchant, category_id, name, updated_at)
select distinct on (p.household_id, m.new_name)
  p.household_id, m.new_name, p.category_id, p.name, p.updated_at
from public.budget_payees p
join (
  select distinct household_id, merchant as old_name, public.budget_merchant(description) as new_name
  from public.budget_transactions
) m on m.household_id = p.household_id and m.old_name = p.merchant
where m.new_name is not null
  and m.new_name <> m.old_name
  and p.merchant !~ '^(RETURN \d\d/\d\d/\d\d|REFUND PURCHASE) '
order by p.household_id, m.new_name, p.updated_at desc
on conflict (household_id, merchant) do nothing;

-- Old names that no transaction will have any more.
delete from public.budget_payees p
 where exists (
   select 1 from public.budget_transactions t
    where t.household_id = p.household_id and t.merchant = p.merchant)
   and not exists (
   select 1 from public.budget_transactions t
    where t.household_id = p.household_id and public.budget_merchant(t.description) = p.merchant);

-- Updating a row works its generated merchant out again.
update public.budget_transactions
   set description = description
 where merchant is distinct from public.budget_merchant(description);
