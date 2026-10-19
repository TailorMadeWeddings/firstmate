-- Migration: galley (KID-16)
-- The household cookbook. Crew (Owners and Trusted members) read every
-- recipe and add their own; Owners change any, others only their own.
-- Collections and sharing with Guests come with KID-22.

create table public.recipes (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  title         text not null check (trim(title) <> ''),
  description   text,
  source_url    text check (source_url is null or source_url ~ '^https?://'),
  servings      integer check (servings between 1 and 100),
  prep_minutes  integer check (prep_minutes between 0 and 10000),
  cook_minutes  integer check (cook_minutes between 0 and 10000),
  created_by    uuid not null default auth.uid() references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index recipes_household_title on public.recipes (household_id, lower(title));
create trigger set_recipes_updated_at
  before update on public.recipes
  for each row execute function public.update_updated_at_column();

-- Ingredients and steps belong to their recipe and go with it.
create table public.recipe_ingredients (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references public.recipes(id) on delete cascade,
  position   integer not null,
  quantity   numeric(10,3) check (quantity is null or quantity > 0),
  unit       text,
  name       text not null check (trim(name) <> ''),
  notes      text
);
create index recipe_ingredients_recipe on public.recipe_ingredients (recipe_id, position);

create table public.recipe_steps (
  id                uuid primary key default gen_random_uuid(),
  recipe_id         uuid not null references public.recipes(id) on delete cascade,
  position          integer not null,
  instruction       text not null check (trim(instruction) <> ''),
  -- For cooking-mode timers (KID-20).
  duration_seconds  integer check (duration_seconds is null or duration_seconds > 0)
);
create index recipe_steps_recipe on public.recipe_steps (recipe_id, position);

-- Free-text tags, lower case: vegetarian, quick, kid-friendly…
create table public.recipe_tags (
  recipe_id  uuid not null references public.recipes(id) on delete cascade,
  tag        text not null check (tag = lower(trim(tag)) and tag <> ''),
  primary key (recipe_id, tag)
);
create index recipe_tags_tag on public.recipe_tags (tag);

-- ============================================================
-- Row-level security
-- ============================================================
alter table public.recipes            enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps       enable row level security;
alter table public.recipe_tags        enable row level security;

create policy "Crew can read household recipes"
  on public.recipes for select to authenticated
  using (public.is_crew_of(household_id));

create policy "Crew can add recipes"
  on public.recipes for insert to authenticated
  with check (public.is_crew_of(household_id) and created_by = auth.uid());

create policy "Owners, and whoever added it, can change a recipe"
  on public.recipes for update to authenticated
  using (public.is_owner_of(household_id) or (public.is_crew_of(household_id) and created_by = auth.uid()))
  with check (public.is_owner_of(household_id) or (public.is_crew_of(household_id) and created_by = auth.uid()));

create policy "Owners, and whoever added it, can delete a recipe"
  on public.recipes for delete to authenticated
  using (public.is_owner_of(household_id) or (public.is_crew_of(household_id) and created_by = auth.uid()));

-- Parts follow their recipe: readable when it is, changeable when it is.
-- (Inside these checks the recipes table's own policies still apply.)
create function public.can_edit_recipe(p_recipe uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.recipes r
    where r.id = p_recipe
      and (public.is_owner_of(r.household_id) or (public.is_crew_of(r.household_id) and r.created_by = auth.uid()))
  );
$$;

create policy "Readable with the recipe" on public.recipe_ingredients for select to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id));
create policy "Editable with the recipe" on public.recipe_ingredients for all to authenticated
  using (public.can_edit_recipe(recipe_id)) with check (public.can_edit_recipe(recipe_id));

create policy "Readable with the recipe" on public.recipe_steps for select to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id));
create policy "Editable with the recipe" on public.recipe_steps for all to authenticated
  using (public.can_edit_recipe(recipe_id)) with check (public.can_edit_recipe(recipe_id));

create policy "Readable with the recipe" on public.recipe_tags for select to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id));
create policy "Editable with the recipe" on public.recipe_tags for all to authenticated
  using (public.can_edit_recipe(recipe_id)) with check (public.can_edit_recipe(recipe_id));

-- ============================================================
-- Saving a recipe and its parts together. p_recipe null creates one.
-- Ingredients: [{quantity, unit, name, notes}], steps: [{instruction,
-- duration_seconds}], in order. security invoker: the caller's row-level
-- security applies.
-- ============================================================
create function public.galley_save_recipe(
  p_recipe uuid,
  p_household uuid,
  p_title text,
  p_description text,
  p_source_url text,
  p_servings integer,
  p_prep_minutes integer,
  p_cook_minutes integer,
  p_ingredients jsonb,
  p_steps jsonb,
  p_tags text[]
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved uuid;
begin
  if p_recipe is null then
    insert into public.recipes (household_id, title, description, source_url, servings, prep_minutes, cook_minutes, created_by)
    values (p_household, trim(p_title), p_description, p_source_url, p_servings, p_prep_minutes, p_cook_minutes, auth.uid())
    returning id into saved;
  else
    update public.recipes
       set title = trim(p_title), description = p_description, source_url = p_source_url,
           servings = p_servings, prep_minutes = p_prep_minutes, cook_minutes = p_cook_minutes
     where id = p_recipe
    returning id into saved;
    if saved is null then
      raise exception 'recipe not found' using errcode = 'P0020';
    end if;
    delete from public.recipe_ingredients where recipe_id = saved;
    delete from public.recipe_steps where recipe_id = saved;
    delete from public.recipe_tags where recipe_id = saved;
  end if;

  insert into public.recipe_ingredients (recipe_id, position, quantity, unit, name, notes)
  select saved, i.n, (i.v->>'quantity')::numeric, nullif(i.v->>'unit', ''), i.v->>'name', nullif(i.v->>'notes', '')
  from jsonb_array_elements(coalesce(p_ingredients, '[]')) with ordinality as i(v, n);

  insert into public.recipe_steps (recipe_id, position, instruction, duration_seconds)
  select saved, s.n, s.v->>'instruction', (s.v->>'duration_seconds')::integer
  from jsonb_array_elements(coalesce(p_steps, '[]')) with ordinality as s(v, n);

  insert into public.recipe_tags (recipe_id, tag)
  select distinct saved, lower(trim(t)) from unnest(coalesce(p_tags, '{}')) as t
  where trim(t) <> '';

  return saved;
end;
$$;
