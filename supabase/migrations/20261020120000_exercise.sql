-- Migration: exercise
-- Activities (aikido, golf, the gym, swimming…) with repeating schedules on
-- the Logbook and sessions ticked off with how long they took; progressive
-- programs (like 100 Pushups) with tests and workouts; and a daily
-- checklist of home exercises and stretches.
-- Private: each person keeps their own; Captains keep the children's.
-- The Logbook shows scheduled sessions by the activity's name only.

/** Whether the caller keeps this person's exercise records: their own, or a child's if they're a Captain. */
create function public.exercise_can_keep(p_household uuid, p_profile uuid, p_dependent uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (p_profile = auth.uid() and public.is_crew_of(p_household))
      or (p_dependent is not null and public.is_owner_of(p_household));
$$;

create table public.activities (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  profile_id    uuid references public.profiles(id) on delete cascade,
  dependent_id  uuid references public.dependents(id) on delete cascade,
  name          text not null check (trim(name) <> '' and length(name) <= 60),
  -- How long a session usually is, to fill in when ticking one off.
  minutes       integer not null default 60 check (minutes between 5 and 600),
  created_at    timestamptz not null default now(),
  constraint activities_one_person check ((profile_id is null) <> (dependent_id is null))
);
create index activities_household on public.activities (household_id);

-- A repeating time slot ("Tue and Thu, 7pm"). The Logbook event is the schedule.
create table public.activity_schedules (
  id           uuid primary key default gen_random_uuid(),
  activity_id  uuid not null references public.activities(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id   uuid references public.profiles(id) on delete cascade,
  dependent_id uuid references public.dependents(id) on delete cascade,
  -- Deleting the event on the Logbook ends the schedule too.
  event_id     uuid not null unique references public.events(id) on delete cascade,
  constraint activity_schedules_one_person check ((profile_id is null) <> (dependent_id is null))
);

create table public.activity_sessions (
  id                uuid primary key default gen_random_uuid(),
  activity_id       uuid not null references public.activities(id) on delete cascade,
  household_id      uuid not null references public.households(id) on delete cascade,
  profile_id        uuid references public.profiles(id) on delete cascade,
  dependent_id      uuid references public.dependents(id) on delete cascade,
  starts_at         timestamptz not null,
  minutes           integer not null check (minutes between 1 and 1440),
  distance_km       numeric(6,2) check (distance_km between 0 and 1000),
  notes             text,
  -- Ticking off a scheduled one: which schedule and which week's session.
  schedule_id       uuid references public.activity_schedules(id) on delete set null,
  occurrence_start  timestamptz,
  -- A one-off session's own Logbook event.
  event_id          uuid references public.events(id) on delete set null,
  created_by        uuid not null default auth.uid() references public.profiles(id),
  created_at        timestamptz not null default now(),
  constraint activity_sessions_one_person check ((profile_id is null) <> (dependent_id is null)),
  unique (schedule_id, occurrence_start)
);
create index activity_sessions_activity on public.activity_sessions (activity_id, starts_at desc);

-- Progressive programs: test your max, then workouts step up from it, with
-- a re-test every few workouts, until the goal.
create table public.exercise_programs (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  profile_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name          text not null check (trim(name) <> '' and length(name) <= 60),
  exercise      text not null check (trim(exercise) <> '' and length(exercise) <= 60),
  unit          text not null default 'reps' check (unit in ('reps', 'seconds')),
  goal          integer not null check (goal between 1 and 10000),
  weekdays      text[] not null default '{MO,WE,FR}' check (weekdays <@ '{MO,TU,WE,TH,FR,SA,SU}' and cardinality(weekdays) between 1 and 7),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table public.program_logs (
  id            uuid primary key default gen_random_uuid(),
  program_id    uuid not null references public.exercise_programs(id) on delete cascade,
  household_id  uuid not null references public.households(id) on delete cascade,
  profile_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  done_on       date not null,
  kind          text not null check (kind in ('test', 'workout')),
  -- A test's result, or a workout's sets as done.
  result        integer check (result between 0 and 100000),
  sets          integer[] check (cardinality(sets) <= 20),
  created_at    timestamptz not null default now(),
  constraint program_logs_shape check ((kind = 'test') = (result is not null) and (kind = 'workout') = (sets is not null))
);
create index program_logs_program on public.program_logs (program_id, created_at);

-- The daily checklist: home exercises and stretches, ticked off each day.
create table public.daily_items (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  profile_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name          text not null check (trim(name) <> '' and length(name) <= 80),
  position      integer not null default 0,
  created_at    timestamptz not null default now()
);
create table public.daily_ticks (
  item_id       uuid not null references public.daily_items(id) on delete cascade,
  household_id  uuid not null references public.households(id) on delete cascade,
  profile_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  day           date not null,
  done_at       timestamptz not null default now(),
  primary key (item_id, day)
);

-- ============================================================
-- Row-level security: whoever keeps that person's records.
-- ============================================================
alter table public.activities         enable row level security;
alter table public.activity_schedules enable row level security;
alter table public.activity_sessions  enable row level security;
alter table public.exercise_programs  enable row level security;
alter table public.program_logs       enable row level security;
alter table public.daily_items        enable row level security;
alter table public.daily_ticks        enable row level security;

create policy "Activities: whoever keeps them" on public.activities for all to authenticated
  using (public.exercise_can_keep(household_id, profile_id, dependent_id))
  with check (public.exercise_can_keep(household_id, profile_id, dependent_id) and public.medical_person_ok(household_id, profile_id, dependent_id));
create policy "Schedules: whoever keeps them" on public.activity_schedules for all to authenticated
  using (public.exercise_can_keep(household_id, profile_id, dependent_id))
  with check (public.exercise_can_keep(household_id, profile_id, dependent_id) and public.medical_person_ok(household_id, profile_id, dependent_id));
create policy "Sessions: whoever keeps them" on public.activity_sessions for all to authenticated
  using (public.exercise_can_keep(household_id, profile_id, dependent_id))
  with check (public.exercise_can_keep(household_id, profile_id, dependent_id) and public.medical_person_ok(household_id, profile_id, dependent_id));
create policy "Programs: your own" on public.exercise_programs for all to authenticated
  using (public.exercise_can_keep(household_id, profile_id, null))
  with check (public.exercise_can_keep(household_id, profile_id, null));
create policy "Program logs: your own" on public.program_logs for all to authenticated
  using (public.exercise_can_keep(household_id, profile_id, null))
  with check (public.exercise_can_keep(household_id, profile_id, null)
              and exists (select 1 from public.exercise_programs p where p.id = program_id));
create policy "Daily items: your own" on public.daily_items for all to authenticated
  using (public.exercise_can_keep(household_id, profile_id, null))
  with check (public.exercise_can_keep(household_id, profile_id, null));
create policy "Daily ticks: your own" on public.daily_ticks for all to authenticated
  using (public.exercise_can_keep(household_id, profile_id, null))
  with check (public.exercise_can_keep(household_id, profile_id, null)
              and exists (select 1 from public.daily_items i where i.id = item_id));

-- ============================================================
-- Schedules and one-off sessions keep their Logbook events in step.
-- security invoker: the caller's row-level security applies.
-- ============================================================

/** Adds or changes a repeating schedule: its Logbook event, titled with the activity's name, for that person. */
create function public.exercise_save_schedule(
  p_schedule uuid,
  p_activity uuid,
  p_start timestamptz,
  p_minutes integer,
  p_rule text,
  p_until timestamptz
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  a public.activities;
  linked uuid;
  saved uuid := p_schedule;
begin
  select * into a from public.activities where id = p_activity;
  if a.id is null then
    raise exception 'activity not found' using errcode = 'P0040';
  end if;
  if p_schedule is null then
    insert into public.events (household_id, title, start_at, end_at, recurrence_rule, recurrence_ends_at, created_by)
    values (a.household_id, a.name, p_start, p_start + make_interval(mins => p_minutes), p_rule, p_until, auth.uid())
    returning id into linked;
    insert into public.activity_schedules (activity_id, household_id, profile_id, dependent_id, event_id)
    values (a.id, a.household_id, a.profile_id, a.dependent_id, linked)
    returning id into saved;
  else
    select event_id into linked from public.activity_schedules where id = p_schedule and activity_id = p_activity;
    if linked is null then
      raise exception 'schedule not found' using errcode = 'P0040';
    end if;
    update public.events
       set title = a.name, start_at = p_start, end_at = p_start + make_interval(mins => p_minutes),
           recurrence_rule = p_rule, recurrence_ends_at = p_until
     where id = linked;
    delete from public.event_assignees where event_id = linked;
  end if;
  insert into public.event_assignees (event_id, profile_id, dependent_id) values (linked, a.profile_id, a.dependent_id);
  return saved;
end;
$$;

/** Logs a session (or ticks off a scheduled one); one-offs get their own Logbook event. */
create function public.exercise_save_session(
  p_session uuid,
  p_activity uuid,
  p_starts timestamptz,
  p_minutes integer,
  p_distance numeric,
  p_notes text,
  p_schedule uuid default null,
  p_occurrence timestamptz default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  a public.activities;
  saved uuid := p_session;
  linked uuid;
begin
  select * into a from public.activities where id = p_activity;
  if a.id is null then
    raise exception 'activity not found' using errcode = 'P0040';
  end if;
  if p_session is null then
    insert into public.activity_sessions (activity_id, household_id, profile_id, dependent_id, starts_at, minutes, distance_km, notes, schedule_id, occurrence_start)
    values (a.id, a.household_id, a.profile_id, a.dependent_id, p_starts, p_minutes, p_distance, p_notes, p_schedule, p_occurrence)
    returning id into saved;
  else
    update public.activity_sessions
       set starts_at = p_starts, minutes = p_minutes, distance_km = p_distance, notes = p_notes
     where id = p_session
    returning event_id into linked;
    if not found then
      raise exception 'session not found' using errcode = 'P0040';
    end if;
  end if;
  -- Scheduled sessions are already on the Logbook; a one-off gets its own event.
  if p_schedule is null and (select schedule_id from public.activity_sessions where id = saved) is null then
    if linked is null then
      insert into public.events (household_id, title, start_at, end_at, created_by)
      values (a.household_id, a.name, p_starts, p_starts + make_interval(mins => p_minutes), auth.uid())
      returning id into linked;
      update public.activity_sessions set event_id = linked where id = saved;
      insert into public.event_assignees (event_id, profile_id, dependent_id) values (linked, a.profile_id, a.dependent_id);
    else
      update public.events set title = a.name, start_at = p_starts, end_at = p_starts + make_interval(mins => p_minutes) where id = linked;
    end if;
  end if;
  return saved;
end;
$$;

-- Removing a schedule or a one-off session takes its Logbook event with it;
-- renaming an activity renames its events.
create function public.exercise_event_gone()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.event_id is not null then
    delete from public.events where id = old.event_id;
  end if;
  return old;
end;
$$;
create trigger activity_schedule_gone after delete on public.activity_schedules
  for each row execute function public.exercise_event_gone();
create trigger activity_session_gone after delete on public.activity_sessions
  for each row execute function public.exercise_event_gone();

create function public.exercise_activity_renamed()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  update public.events set title = new.name
   where id in (select event_id from public.activity_schedules where activity_id = new.id
                union select event_id from public.activity_sessions where activity_id = new.id and event_id is not null);
  return new;
end;
$$;
create trigger activity_renamed after update of name on public.activities
  for each row when (old.name is distinct from new.name)
  execute function public.exercise_activity_renamed();
