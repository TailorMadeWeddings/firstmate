-- Migration: ledger_payees
-- Reconciling imported transactions, and remembering how. Each transaction
-- gets a merchant: the bank's description with the noise taken out (card
-- number, value date, store number, state), so every visit to one shop
-- shares it. When an Owner picks a category for a merchant, the Ledger
-- remembers it in budget_payees and suggests it for that merchant's other
-- transactions, including ones imported later. Suggestions wait for an
-- Owner to confirm them; only confirmations teach the Ledger.

-- "SQ *ELMAS ON CLYDE Hamilton Nort AU" → "ELMAS ON CLYDE HAMILTON NORT",
-- "COLES 0746 WARATAH NS AUS Card xx1569 Value Date: 24/07/2026" → "COLES WARATAH".
-- ponytail: tuned on CommBank exports; each suburb's Coles is its own
-- merchant. Changing this later means dropping and re-adding the column.
create function public.budget_merchant(description text) returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(upper(trim(regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(description,
      -- card purchases: "… Card xx1569 USD 6.00 Value Date: 10/07/2026"
      '\s+(Card xx\d+|Value Date:).*$', '', 'i'),
      -- transfers: the note after "CommBank App" differs every time
      '\s+(CommBank App|PayID Phone|CREDIT TO ACCOUNT)\M.*$', '', 'i'),
      -- "Fast Transfer From" has no marker before its note; keep two words of the name
      '^(Fast Transfer From \S+ \S+).*$', '\1', 'i'),
      -- payment processors: "SQ *", "NXT*", "SMP*"
      '^[A-Z]{2,4} ?\* ?', '', 'i'),
      -- store and reference numbers, but not account numbers like xx0689
      '\m\d{3,}\M', '', 'g'),
    -- state and country on the end
    '(\s+(NSW?|NSWAU|AUS?|USA))+$', '', 'i'),
    '\s+', ' ', 'g')
  )), '')
$$;

alter table public.budget_transactions
  add column merchant text generated always as (public.budget_merchant(description)) stored,
  -- Who suggested the category (or the transfer), while it waits for an
  -- Owner. Null once confirmed, and for everything entered by hand.
  add column suggested_by text check (suggested_by in ('payee', 'claude'));

create index budget_transactions_merchant on public.budget_transactions (household_id, merchant);

-- ============================================================
-- budget_payees: what each merchant is, as last confirmed
-- ============================================================
create table public.budget_payees (
  household_id  uuid not null references public.households(id) on delete cascade,
  merchant      text not null,
  -- Null: money moved to or from one of the household's own accounts.
  category_id   uuid,
  updated_at    timestamptz not null default now(),
  primary key (household_id, merchant),
  -- A category can only be deleted while unused; its memory goes with it
  -- (set null would turn it into a transfer).
  foreign key (category_id, household_id)
    references public.budget_categories (id, household_id)
    on delete cascade
);

alter table public.budget_payees enable row level security;

create policy "Owners have full access to payees"
  on public.budget_payees for all to authenticated
  using (public.is_owner_of(household_id))
  with check (public.is_owner_of(household_id));

-- ============================================================
-- New transactions from a known merchant come in suggested.
-- ============================================================
-- A transfer to one of the household's own accounts that isn't in the
-- Ledger is half a transfer: a transfer_id with no other side. Reports
-- and budgets already leave transfers out.
create function public.budget_suggest() returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  known public.budget_payees;
begin
  if new.category_id is null and new.transfer_id is null and new.goal_id is null then
    -- Generated columns aren't filled in yet in a before trigger.
    select * into known from public.budget_payees
     where household_id = new.household_id and merchant = public.budget_merchant(new.description);
    if found then
      new.suggested_by := 'payee';
      if known.category_id is null then
        new.transfer_id := gen_random_uuid();
      else
        new.category_id := known.category_id;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger budget_transactions_suggest
  before insert on public.budget_transactions
  for each row execute function public.budget_suggest();

-- Remembers a merchant's category (null: own-account transfer) and applies
-- it to that merchant's transactions still waiting: uncategorised, or
-- suggested. p_confirm marks them confirmed; otherwise they become
-- suggestions. Real two-sided transfers and goal savings are left alone.
-- Returns how many transactions changed.
-- security invoker: the caller's row-level security applies (Owners only).
create function public.budget_learn(
  p_household uuid, p_merchant text, p_category uuid, p_confirm boolean
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed integer;
begin
  insert into public.budget_payees (household_id, merchant, category_id)
  values (p_household, p_merchant, p_category)
  on conflict (household_id, merchant)
    do update set category_id = excluded.category_id, updated_at = now();
  update public.budget_transactions t
     set category_id = p_category,
         transfer_id = case when p_category is null then coalesce(t.transfer_id, gen_random_uuid()) end,
         suggested_by = case when p_confirm then null else 'payee' end
   where t.household_id = p_household
     and t.merchant = p_merchant
     and t.goal_id is null
     and (t.suggested_by is not null or (t.category_id is null and t.transfer_id is null));
  get diagnostics changed = row_count;
  return changed;
end;
$$;

-- Merchants with transactions waiting, for the Reconcile page: one row per
-- merchant, so a choice covers all of them. suggested is the remembered
-- category; known says whether there is one (a null category is a transfer).
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
  p.merchant is not null as known,
  p.category_id as suggested
from public.budget_transactions t
left join public.budget_payees p on p.household_id = t.household_id and p.merchant = t.merchant
where t.merchant is not null
  and t.goal_id is null
  and (t.suggested_by is not null or (t.category_id is null and t.transfer_id is null))
group by t.household_id, t.merchant, p.merchant, p.category_id;
