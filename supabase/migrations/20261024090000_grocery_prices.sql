-- Migration: grocery_prices
-- What groceries cost, store by store, built up day by day into a library of
-- what's likely. Coles, Woolworths, Aldi and Harris Farm are checked every
-- morning (app/api/prices); Costco, which keeps its warehouse prices offline,
-- comes from receipts Claude reads (the MCP server's add_prices).

-- An ingredient the household follows. search is what the supermarkets are
-- asked for, so "milk" can be searched as "full cream milk 2l".
create table public.price_items (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  name          text not null check (trim(name) <> '' and length(name) <= 80),
  search        text not null check (trim(search) <> '' and length(search) <= 80),
  created_by    uuid not null default auth.uid() references public.profiles(id),
  created_at    timestamptz not null default now()
);
create unique index price_items_name on public.price_items (household_id, lower(name));

-- One product's price at one store on one day. product_id is the store's
-- own code (a Costco receipt's item number), so a product seen twice in a day
-- is one row. unit_price is per kg, L or each, for comparing sizes.
create table public.prices (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  item_id       uuid not null references public.price_items(id) on delete cascade,
  store         text not null check (store in ('coles', 'woolworths', 'aldi', 'harris_farm', 'costco')),
  product_id    text not null check (trim(product_id) <> ''),
  product       text not null check (trim(product) <> ''),
  size          text,
  price         numeric(10,2) not null check (price >= 0),
  was_price     numeric(10,2) check (was_price is null or was_price > price),
  unit_price    numeric(12,4) check (unit_price is null or unit_price >= 0),
  unit          text check (unit in ('kg', 'l', 'each')),
  seen_on       date not null,
  source        text not null check (source in ('pull', 'receipt')),
  added_by      uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  check ((unit is null) = (unit_price is null)),
  unique (item_id, store, product_id, seen_on)
);
create index prices_item_seen on public.prices (item_id, seen_on desc);

-- ============================================================
-- Row-level security. The crew read prices and choose what to follow;
-- prices themselves are written by the server (the morning check and the
-- MCP server, both with the secret key), never straight from a browser.
-- ============================================================
alter table public.price_items enable row level security;
alter table public.prices      enable row level security;

create policy "Crew can read what's followed"
  on public.price_items for select to authenticated
  using (public.is_crew_of(household_id));

create policy "Crew can follow an ingredient"
  on public.price_items for insert to authenticated
  with check (public.is_crew_of(household_id) and created_by = auth.uid());

create policy "Crew can change what's searched for"
  on public.price_items for update to authenticated
  using (public.is_crew_of(household_id))
  with check (public.is_crew_of(household_id));

create policy "Owners, and whoever added it, can stop following"
  on public.price_items for delete to authenticated
  using (public.is_owner_of(household_id) or (public.is_crew_of(household_id) and created_by = auth.uid()));

create policy "Crew can read prices"
  on public.prices for select to authenticated
  using (public.is_crew_of(household_id));

-- ============================================================
-- Each store's prices for an ingredient over the last year, in each unit
-- they were seen in: the usual (median) and lowest per kg, L or each, and
-- the cheapest product on the most recent day it was seen.
-- ============================================================
create view public.price_summary
  with (security_invoker = true) as
with recent as (
  select * from public.prices where unit_price is not null and seen_on > current_date - 365
),
stats as (
  select household_id, item_id, store, unit,
         percentile_cont(0.5) within group (order by unit_price)::numeric(12,4) as usual,
         min(unit_price) as lowest,
         count(distinct seen_on)::int as days
  from recent
  group by household_id, item_id, store, unit
),
latest as (
  select distinct on (item_id, store, unit)
         item_id, store, unit, product, size, price, was_price, unit_price, seen_on
  from recent
  order by item_id, store, unit, seen_on desc, unit_price
)
select s.household_id, s.item_id, s.store, s.unit, s.usual, s.lowest, s.days,
       l.product, l.size, l.price, l.was_price, l.unit_price, l.seen_on
from stats s
join latest l using (item_id, store, unit);
