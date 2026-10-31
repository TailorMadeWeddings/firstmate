-- Migration: the Galley's shopping list and meal plan
-- One list for the household. The crew (Owners and Trusted members) add to it,
-- tick things off in the shop and clear what's ticked; Guests see none of it.
-- Items added from a recipe remember which, so the list can say what they're for.

create table public.shopping_items (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  name          text not null check (trim(name) <> '' and length(name) <= 200),
  recipe_id     uuid references public.recipes(id) on delete set null,
  checked_at    timestamptz,
  added_by      uuid not null default auth.uid() references public.profiles(id),
  created_at    timestamptz not null default now()
);
create index shopping_items_household on public.shopping_items (household_id, created_at);

alter table public.shopping_items enable row level security;

create policy "Crew can read the shopping list"
  on public.shopping_items for select to authenticated
  using (public.is_crew_of(household_id));

create policy "Crew can add to the shopping list"
  on public.shopping_items for insert to authenticated
  with check (
    public.is_crew_of(household_id) and added_by = auth.uid()
    and (recipe_id is null or exists (select 1 from public.recipes r where r.id = recipe_id and r.household_id = shopping_items.household_id))
  );

create policy "Crew can tick things off"
  on public.shopping_items for update to authenticated
  using (public.is_crew_of(household_id))
  with check (public.is_crew_of(household_id));

create policy "Crew can clear the shopping list"
  on public.shopping_items for delete to authenticated
  using (public.is_crew_of(household_id));

-- Ticked off on one phone, greyed out on the other.
alter publication supabase_realtime add table public.shopping_items;

-- ============================================================
-- The meal plan: lunch and dinner, one of each a day. Usually a recipe, but
-- the title stands on its own ("Leftovers", "Takeaway") and outlives a
-- deleted recipe. The Logbook shows them at the top of each day.
-- ============================================================
create table public.meal_plans (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  day           date not null,
  meal          text not null check (meal in ('lunch', 'dinner')),
  title         text not null check (trim(title) <> '' and length(title) <= 200),
  recipe_id     uuid references public.recipes(id) on delete set null,
  added_by      uuid not null default auth.uid() references public.profiles(id),
  created_at    timestamptz not null default now(),
  unique (household_id, day, meal)
);

alter table public.meal_plans enable row level security;

create policy "Crew can read the meal plan"
  on public.meal_plans for select to authenticated
  using (public.is_crew_of(household_id));

create policy "Crew can plan meals"
  on public.meal_plans for insert to authenticated
  with check (
    public.is_crew_of(household_id) and added_by = auth.uid()
    and (recipe_id is null or exists (select 1 from public.recipes r where r.id = recipe_id and r.household_id = meal_plans.household_id))
  );

create policy "Crew can change the meal plan"
  on public.meal_plans for update to authenticated
  using (public.is_crew_of(household_id))
  with check (
    public.is_crew_of(household_id)
    and (recipe_id is null or exists (select 1 from public.recipes r where r.id = recipe_id and r.household_id = meal_plans.household_id))
  );

create policy "Crew can clear the meal plan"
  on public.meal_plans for delete to authenticated
  using (public.is_crew_of(household_id));

alter publication supabase_realtime add table public.meal_plans;
