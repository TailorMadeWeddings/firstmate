-- Migration: the rest of the Galley (KID-16, KID-18, KID-19, KID-21, KID-22)
-- Collections and sharing them, a log of when recipes are cooked, recipe
-- photos, and meals on the Logbook.

-- ============================================================
-- Collections: Owner-curated sets of recipes ("Sunday roasts").
-- ============================================================
create table public.recipe_collections (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  name          text not null check (trim(name) <> ''),
  created_by    uuid not null default auth.uid() references public.profiles(id),
  created_at    timestamptz not null default now()
);
create index recipe_collections_household on public.recipe_collections (household_id, lower(name));

create table public.collection_recipes (
  collection_id  uuid not null references public.recipe_collections(id) on delete cascade,
  recipe_id      uuid not null references public.recipes(id) on delete cascade,
  added_by       uuid not null default auth.uid() references public.profiles(id),
  added_at       timestamptz not null default now(),
  primary key (collection_id, recipe_id)
);
create index collection_recipes_recipe on public.collection_recipes (recipe_id);

-- Sharing a collection with a Trusted member or a Guest. "read" sees its
-- recipes; "contribute" may also add recipes to it.
create table public.collection_shares (
  collection_id  uuid not null references public.recipe_collections(id) on delete cascade,
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  permission     text not null default 'read' check (permission in ('read', 'contribute')),
  created_at     timestamptz not null default now(),
  primary key (collection_id, profile_id)
);
create index collection_shares_profile on public.collection_shares (profile_id);

-- ============================================================
-- Helpers. security definer so policies on these tables can look at each
-- other without going round in circles; each answers for the caller only.
-- ============================================================
create function public.owns_collection(p_collection uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.recipe_collections c
    where c.id = p_collection and public.is_owner_of(c.household_id)
  );
$$;

create function public.collection_shared_with_me(p_collection uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.collection_shares s
    where s.collection_id = p_collection and s.profile_id = auth.uid()
  );
$$;

/** Owners, and anyone it's shared with to contribute, can add recipes to a collection. */
create function public.can_contribute_to(p_collection uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.owns_collection(p_collection) or exists (
    select 1 from public.collection_shares s
    where s.collection_id = p_collection and s.profile_id = auth.uid() and s.permission = 'contribute'
  );
$$;

/** Whether the caller contributes to any collection in the household (so may write recipes there). */
create function public.contributes_in(p_household uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.collection_shares s
    join public.recipe_collections c on c.id = s.collection_id
    where c.household_id = p_household and s.profile_id = auth.uid() and s.permission = 'contribute'
  );
$$;

/** A recipe in a collection shared with the caller. */
create function public.recipe_shared_with_me(p_recipe uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.collection_recipes cr
    join public.collection_shares s on s.collection_id = cr.collection_id
    where cr.recipe_id = p_recipe and s.profile_id = auth.uid()
  );
$$;

/** Recipe and collection from the same household. */
create function public.same_galley(p_collection uuid, p_recipe uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.recipe_collections c
    join public.recipes r on r.household_id = c.household_id
    where c.id = p_collection and r.id = p_recipe
  );
$$;

/** Shares go to household members who aren't Owners (Owners see everything already). */
create function public.can_share_with(p_collection uuid, p_profile uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.recipe_collections c
    join public.household_members m on m.household_id = c.household_id
    where c.id = p_collection and m.profile_id = p_profile and m.role <> 'owner'
  );
$$;

-- ============================================================
-- Recipes: crew see them all; others see what's shared with them, and
-- contributors see and change what they wrote. Revoking a share takes
-- effect on the next read, because every read checks.
-- ============================================================
drop policy "Crew can read household recipes" on public.recipes;
drop policy "Crew can add recipes" on public.recipes;
drop policy "Owners, and whoever added it, can change a recipe" on public.recipes;
drop policy "Owners, and whoever added it, can delete a recipe" on public.recipes;

create policy "Crew, and those it's shared with, can read recipes"
  on public.recipes for select to authenticated
  using (
    public.is_crew_of(household_id)
    or public.recipe_shared_with_me(id)
    or (created_by = auth.uid() and public.contributes_in(household_id))
  );

create policy "Crew and contributors can add recipes"
  on public.recipes for insert to authenticated
  with check (created_by = auth.uid() and (public.is_crew_of(household_id) or public.contributes_in(household_id)));

create policy "Owners, and whoever added it, can change a recipe"
  on public.recipes for update to authenticated
  using (public.is_owner_of(household_id) or (created_by = auth.uid() and (public.is_crew_of(household_id) or public.contributes_in(household_id))))
  with check (public.is_owner_of(household_id) or (created_by = auth.uid() and (public.is_crew_of(household_id) or public.contributes_in(household_id))));

create policy "Owners, and whoever added it, can delete a recipe"
  on public.recipes for delete to authenticated
  using (public.is_owner_of(household_id) or (created_by = auth.uid() and (public.is_crew_of(household_id) or public.contributes_in(household_id))));

create or replace function public.can_edit_recipe(p_recipe uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.recipes r
    where r.id = p_recipe
      and (public.is_owner_of(r.household_id)
           or (r.created_by = auth.uid() and (public.is_crew_of(r.household_id) or public.contributes_in(r.household_id))))
  );
$$;

-- ============================================================
-- Collection policies
-- ============================================================
alter table public.recipe_collections enable row level security;
alter table public.collection_recipes enable row level security;
alter table public.collection_shares  enable row level security;

create policy "Crew, and those it's shared with, can see a collection"
  on public.recipe_collections for select to authenticated
  using (public.is_crew_of(household_id) or public.collection_shared_with_me(id));
create policy "Owners make collections"
  on public.recipe_collections for insert to authenticated
  with check (public.is_owner_of(household_id) and created_by = auth.uid());
create policy "Owners rename collections"
  on public.recipe_collections for update to authenticated
  using (public.is_owner_of(household_id)) with check (public.is_owner_of(household_id));
create policy "Owners delete collections"
  on public.recipe_collections for delete to authenticated
  using (public.is_owner_of(household_id));

create policy "Readable with the collection"
  on public.collection_recipes for select to authenticated
  using (exists (select 1 from public.recipe_collections c where c.id = collection_id));
-- The recipe check runs with the caller's own row-level security, so you
-- can only file recipes you can see.
create policy "Owners and contributors add recipes"
  on public.collection_recipes for insert to authenticated
  with check (
    added_by = auth.uid()
    and public.can_contribute_to(collection_id)
    and public.same_galley(collection_id, recipe_id)
    and exists (select 1 from public.recipes r where r.id = recipe_id)
  );
create policy "Owners, or whoever added it, take recipes out"
  on public.collection_recipes for delete to authenticated
  using (public.owns_collection(collection_id) or (added_by = auth.uid() and public.can_contribute_to(collection_id)));

create policy "Owners, and the person it's shared with, see a share"
  on public.collection_shares for select to authenticated
  using (profile_id = auth.uid() or public.owns_collection(collection_id));
create policy "Owners share collections"
  on public.collection_shares for insert to authenticated
  with check (public.owns_collection(collection_id) and public.can_share_with(collection_id, profile_id));
create policy "Owners change shares"
  on public.collection_shares for update to authenticated
  using (public.owns_collection(collection_id))
  with check (public.owns_collection(collection_id) and public.can_share_with(collection_id, profile_id));
create policy "Owners revoke shares"
  on public.collection_shares for delete to authenticated
  using (public.owns_collection(collection_id));

-- ============================================================
-- Saving a recipe can also file it in a collection (how a contributor
-- adds a new recipe to the collection shared with them). The signature
-- changes, so the old function goes.
-- ============================================================
drop function public.galley_save_recipe(uuid, uuid, text, text, text, integer, integer, integer, jsonb, jsonb, text[]);

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
  p_tags text[],
  p_collection uuid default null
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

  if p_collection is not null then
    insert into public.collection_recipes (collection_id, recipe_id, added_by)
    values (p_collection, saved, auth.uid())
    on conflict do nothing;
  end if;

  return saved;
end;
$$;

-- ============================================================
-- When each recipe was cooked (cooking mode's Done), for "recently cooked".
-- ============================================================
create table public.recipe_cooks (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references public.recipes(id) on delete cascade,
  cooked_by  uuid not null default auth.uid() references public.profiles(id),
  cooked_at  timestamptz not null default now()
);
create index recipe_cooks_recipe on public.recipe_cooks (recipe_id, cooked_at desc);
alter table public.recipe_cooks enable row level security;

create policy "Readable with the recipe" on public.recipe_cooks for select to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id));
create policy "Whoever can read a recipe can say they cooked it" on public.recipe_cooks for insert to authenticated
  with check (cooked_by = auth.uid() and exists (select 1 from public.recipes r where r.id = recipe_id));

-- ============================================================
-- A photo per recipe, in a private bucket under <recipe id>/. Seeing the
-- photo follows seeing the recipe; changing it follows changing the recipe.
-- ============================================================
alter table public.recipes add column photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-photos', 'recipe-photos', false, 5242880, '{image/jpeg,image/png,image/webp}');

create policy "Recipe photos: readable with the recipe"
  on storage.objects for select to authenticated
  using (bucket_id = 'recipe-photos' and exists (
    select 1 from public.recipes r where r.id::text = (storage.foldername(name))[1]
  ));
create policy "Recipe photos: added by whoever can change the recipe"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'recipe-photos' and exists (
    select 1 from public.recipes r where r.id::text = (storage.foldername(name))[1] and public.can_edit_recipe(r.id)
  ));
create policy "Recipe photos: removed by whoever can change the recipe"
  on storage.objects for delete to authenticated
  using (bucket_id = 'recipe-photos' and exists (
    select 1 from public.recipes r where r.id::text = (storage.foldername(name))[1] and public.can_edit_recipe(r.id)
  ));

-- ============================================================
-- Meals on the Logbook: an event can be for cooking a recipe (KID-21).
-- ============================================================
alter table public.events add column recipe_id uuid references public.recipes(id) on delete set null;
create index events_recipe on public.events (recipe_id) where recipe_id is not null;
