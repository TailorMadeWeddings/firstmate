-- Migration: ledger_merchant_cleanup
-- Three kinds of bank text were splitting one shop into many merchants:
-- Apple bills end in a reference ("APPLE APPLE.COM/BILL MML4K69W9MA1"),
-- Chargefox starts with a changing number ("008Pin* Chargefox …"), and some
-- card lines carry a stray "02" ("COLES 0746 WARATAH 02 AUS …"). Same
-- function, one step per line now, then every transaction's merchant is
-- worked out again, and remembered payees move to their new names.

create or replace function public.budget_merchant(description text) returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  d text := description;
begin
  -- card purchases: "… Card xx1569 USD 6.00 Value Date: 10/07/2026"
  d := regexp_replace(d, '\s+(Card xx\d+|Value Date:).*$', '', 'i');
  -- transfers: the note after "CommBank App" differs every time
  d := regexp_replace(d, '\s+(CommBank App|PayID Phone|CREDIT TO ACCOUNT)\M.*$', '', 'i');
  -- "Fast Transfer From" has no marker before its note; keep two words of the name
  d := regexp_replace(d, '^(Fast Transfer From \S+ \S+).*$', '\1', 'i');
  -- Apple: a reference per bill
  d := regexp_replace(d, '^(Apple APPLE\.COM/BILL)\s.*$', '\1', 'i');
  -- payment processors: "SQ *", "NXT*", "SMP*", and Chargefox's "008Pin*"
  d := regexp_replace(d, '^(\d+PIN|[A-Z]{2,4}) ?\* ?', '', 'i');
  -- store and reference numbers, but not account numbers like xx0689
  d := regexp_replace(d, '\m\d{3,}\M', '', 'g');
  -- state and country on the end
  d := regexp_replace(d, '(\s+(NSW?|NSWAU|AUS?|USA))+$', '', 'i');
  -- a stray "02" left on the end
  d := regexp_replace(d, '\s+\d{1,2}$', '');
  return nullif(upper(trim(regexp_replace(d, '\s+', ' ', 'g'))), '');
end;
$$;

-- Updating a row works its generated merchant out again.
update public.budget_transactions
   set description = description
 where merchant is distinct from public.budget_merchant(description);

-- A remembered merchant cleans up the same way as its bank text did.
-- Where the new name is already remembered, that choice stands.
update public.budget_payees p
   set merchant = public.budget_merchant(p.merchant)
 where public.budget_merchant(p.merchant) <> p.merchant
   and not exists (
     select 1 from public.budget_payees q
      where q.household_id = p.household_id and q.merchant = public.budget_merchant(p.merchant));
