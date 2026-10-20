-- Migration: duties (the family to-do list)
-- Crew (Owners and Trusted members) share one list: anyone adds, edits and
-- ticks things off; Owners, or whoever added it, delete. Guests see none.

create table public.duties (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references public.households(id) on delete cascade,
  title               text not null check (trim(title) <> '' and length(title) <= 200),
  notes               text,
  category            text check (category is null or (trim(category) <> '' and length(category) <= 40)),
  due_on              date,
  -- Repeating duties move to their next date when ticked off, rather than staying done.
  repeat              text check (repeat in ('daily', 'weekly', 'fortnightly', 'monthly', 'yearly')),
  important           boolean not null default false,
  assigned_profile    uuid references public.profiles(id) on delete set null,
  assigned_dependent  uuid references public.dependents(id) on delete set null,
  done_at             timestamptz,
  done_by             uuid references public.profiles(id) on delete set null,
  created_by          uuid not null default auth.uid() references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint duties_one_assignee check (assigned_profile is null or assigned_dependent is null),
  constraint duties_repeat_needs_date check (repeat is null or due_on is not null)
);
create index duties_household_open on public.duties (household_id, due_on) where done_at is null;
create index duties_household_done on public.duties (household_id, done_at desc) where done_at is not null;
create trigger set_duties_updated_at
  before update on public.duties
  for each row execute function public.update_updated_at_column();

/** Whoever a duty is for must be in its household. */
create function public.duty_assignee_ok(p_household uuid, p_profile uuid, p_dependent uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (p_profile is null or exists (
            select 1 from public.household_members m where m.household_id = p_household and m.profile_id = p_profile))
     and (p_dependent is null or exists (
            select 1 from public.dependents d where d.household_id = p_household and d.id = p_dependent));
$$;

alter table public.duties enable row level security;

create policy "Crew can read household duties"
  on public.duties for select to authenticated
  using (public.is_crew_of(household_id));

create policy "Crew can add duties"
  on public.duties for insert to authenticated
  with check (
    public.is_crew_of(household_id) and created_by = auth.uid()
    and public.duty_assignee_ok(household_id, assigned_profile, assigned_dependent)
  );

create policy "Crew can change and tick off duties"
  on public.duties for update to authenticated
  using (public.is_crew_of(household_id))
  with check (
    public.is_crew_of(household_id)
    and public.duty_assignee_ok(household_id, assigned_profile, assigned_dependent)
  );

create policy "Owners, and whoever added it, can delete a duty"
  on public.duties for delete to authenticated
  using (public.is_owner_of(household_id) or (public.is_crew_of(household_id) and created_by = auth.uid()));

-- Ticking something off on a phone shows on The Helm straight away.
alter publication supabase_realtime add table public.duties;
