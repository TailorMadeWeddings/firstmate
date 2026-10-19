-- Migration: logbook (KID-10 to KID-13)

-- ============================================================
-- Crew: Owners (Captains) and Trusted members (Officers). Guests
-- (Visitors) only ever see what's explicitly shared with them.
-- ============================================================
create or replace function public.is_crew_of(p_household_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members
    where household_id = p_household_id
      and profile_id = auth.uid()
      and role in ('owner', 'trusted')
  );
$$;
comment on function public.is_crew_of(uuid) is
  'True if the calling user is an Owner or Trusted member of the household (not a Guest).';

-- The original "Trusted" event policies only checked membership, which let
-- Guests read and add events too. Same rules, crew only.
drop policy "Trusted members can view household events" on public.events;
drop policy "Trusted members can create events" on public.events;
drop policy "Trusted members can update own events" on public.events;
drop policy "Trusted members can delete own events" on public.events;

create policy "Crew can view household events"
  on public.events for select to authenticated
  using (public.is_crew_of(household_id));

create policy "Crew can create events"
  on public.events for insert to authenticated
  with check (public.is_crew_of(household_id) and created_by = auth.uid());

create policy "Crew can update own events"
  on public.events for update to authenticated
  using (public.is_crew_of(household_id) and created_by = auth.uid())
  with check (public.is_crew_of(household_id) and created_by = auth.uid());

create policy "Crew can delete own events"
  on public.events for delete to authenticated
  using (public.is_crew_of(household_id) and created_by = auth.uid());

-- ============================================================
-- A colour per person, for their events on the Logbook.
-- ============================================================
alter table public.profiles
  add column color text check (color ~ '^#[0-9a-f]{6}$');
alter table public.dependents
  add column color text check (color ~ '^#[0-9a-f]{6}$');

-- Captains can tidy up crew names and colours, not just their own.
create policy "Owners can update household members' profiles"
  on public.profiles for update to authenticated
  using (
    exists (
      select 1 from public.household_members m
      where m.profile_id = profiles.id and public.is_owner_of(m.household_id)
    )
  )
  with check (
    exists (
      select 1 from public.household_members m
      where m.profile_id = profiles.id and public.is_owner_of(m.household_id)
    )
  );

-- ============================================================
-- Saving an event and who it's for, together.
-- p_event null creates one. p_split_from (with p_event) is "this and
-- following" on a repeating event: the old series stops there and a new
-- one starts with these details. Assignees must belong to the event's
-- household. security invoker: the caller's row-level security applies.
-- ============================================================
create function public.logbook_save_event(
  p_event uuid,
  p_household uuid,
  p_title text,
  p_description text,
  p_location text,
  p_start timestamptz,
  p_end timestamptz,
  p_all_day boolean,
  p_rule text,
  p_rule_ends timestamptz,
  p_profiles uuid[],
  p_dependents uuid[],
  p_split_from timestamptz default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved uuid;
  home uuid := p_household;
begin
  if coalesce(trim(p_title), '') = '' then
    raise exception 'give the event a name' using errcode = 'P0010';
  end if;

  if p_event is not null then
    select household_id into home from public.events where events.id = p_event;
    if home is null then
      raise exception 'event not found' using errcode = 'P0011';
    end if;
  end if;

  if p_event is null or p_split_from is not null then
    if p_split_from is not null then
      update public.events set recurrence_ends_at = p_split_from where events.id = p_event;
      if not found then
        raise exception 'event not found' using errcode = 'P0011';
      end if;
    end if;
    insert into public.events (household_id, title, description, location, start_at, end_at, all_day,
                               recurrence_rule, recurrence_ends_at, created_by)
    values (home, trim(p_title), p_description, p_location, p_start, p_end, p_all_day,
            p_rule, p_rule_ends, auth.uid())
    returning events.id into saved;
  else
    update public.events
       set title = trim(p_title), description = p_description, location = p_location,
           start_at = p_start, end_at = p_end, all_day = p_all_day,
           recurrence_rule = p_rule, recurrence_ends_at = p_rule_ends
     where events.id = p_event;
    if not found then
      raise exception 'event not found' using errcode = 'P0011';
    end if;
    saved := p_event;
    delete from public.event_assignees where event_id = saved;
  end if;

  if exists (
    select 1 from unnest(coalesce(p_profiles, '{}')) as p(pid)
    where not exists (select 1 from public.household_members m where m.household_id = home and m.profile_id = p.pid)
  ) or exists (
    select 1 from unnest(coalesce(p_dependents, '{}')) as d(did)
    where not exists (select 1 from public.dependents x where x.household_id = home and x.id = d.did)
  ) then
    raise exception 'assignees must be in the household' using errcode = 'P0012';
  end if;

  insert into public.event_assignees (event_id, profile_id)
  select saved, pid from unnest(coalesce(p_profiles, '{}')) as p(pid);
  insert into public.event_assignees (event_id, dependent_id)
  select saved, did from unnest(coalesce(p_dependents, '{}')) as d(did);

  return saved;
end;
$$;
