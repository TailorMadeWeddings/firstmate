-- Migration: rls_policies
-- Adds row-level security policies for the foundation tables.
-- Uses security-definer helper functions to avoid recursive policy loops.

-- ============================================================
-- Helper functions (security definer to bypass RLS internally)
-- ============================================================

-- Returns the set of household IDs the current user belongs to.
create or replace function public.current_user_household_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select household_id
  from public.household_members
  where profile_id = auth.uid();
$$;
comment on function public.current_user_household_ids() is
  'Returns household IDs the calling user is a member of. Security definer to avoid RLS recursion.';
-- Returns true if the current user is an Owner of the given household.
create or replace function public.is_owner_of(p_household_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = p_household_id
      and profile_id = auth.uid()
      and role = 'owner'
  );
$$;
comment on function public.is_owner_of(uuid) is
  'True if the calling user is an Owner of the given household.';
-- ============================================================
-- Policies: households
-- ============================================================
-- v1 deliberately has no INSERT/DELETE policies — only one household
-- exists, and it was created manually during KID-4 seeding.

create policy "Members can view their households"
  on public.households for select
  to authenticated
  using (id in (select public.current_user_household_ids()));
create policy "Owners can update their household"
  on public.households for update
  to authenticated
  using (public.is_owner_of(id))
  with check (public.is_owner_of(id));
-- ============================================================
-- Policies: profiles
-- ============================================================
-- A user always sees their own profile. They also see profiles of
-- people who share a household with them. They can only update
-- their own profile.

create policy "Users can view their own profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());
create policy "Users can view household-mates' profiles"
  on public.profiles for select
  to authenticated
  using (
    id in (
      select profile_id
      from public.household_members
      where household_id in (select public.current_user_household_ids())
    )
  );
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
-- No INSERT policy: profile rows are created exclusively by the
-- on_auth_user_created trigger (which runs as security definer).
-- No DELETE policy: profiles are cleaned up by the on-delete-cascade
-- from auth.users.

-- ============================================================
-- Policies: household_members
-- ============================================================

create policy "Members can see other members of their households"
  on public.household_members for select
  to authenticated
  using (household_id in (select public.current_user_household_ids()));
create policy "Owners can add household members"
  on public.household_members for insert
  to authenticated
  with check (public.is_owner_of(household_id));
create policy "Owners can update member roles"
  on public.household_members for update
  to authenticated
  using (public.is_owner_of(household_id))
  with check (public.is_owner_of(household_id));
create policy "Owners can remove household members"
  on public.household_members for delete
  to authenticated
  using (public.is_owner_of(household_id));
-- ============================================================
-- Policies: dependents
-- ============================================================

create policy "Members can see dependents in their household"
  on public.dependents for select
  to authenticated
  using (household_id in (select public.current_user_household_ids()));
create policy "Owners can add dependents"
  on public.dependents for insert
  to authenticated
  with check (public.is_owner_of(household_id));
create policy "Owners can update dependents"
  on public.dependents for update
  to authenticated
  using (public.is_owner_of(household_id))
  with check (public.is_owner_of(household_id));
create policy "Owners can remove dependents"
  on public.dependents for delete
  to authenticated
  using (public.is_owner_of(household_id));
