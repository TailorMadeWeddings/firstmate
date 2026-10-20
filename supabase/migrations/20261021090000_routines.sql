-- Migration: routines
-- Gym routines: an ordered list of exercises with sets, reps and load, done on
-- chosen weekdays and logged with what was actually lifted. Claude writes
-- them through the MCP server; the app shows them at the gym.
-- Private like programs: each person keeps their own.

create table public.routines (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  profile_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name          text not null check (trim(name) <> '' and length(name) <= 60),
  category      text check (length(category) <= 40),
  description   text check (length(description) <= 2000),
  warm_up       text check (length(warm_up) <= 2000),
  progression   text check (length(progression) <= 2000),
  -- Where it came from, like a video to watch. Only web links, so it's safe as an href.
  link          text check (link ~ '^https?://\S+$' and length(link) <= 500),
  rest_seconds  integer check (rest_seconds between 0 and 600),
  weekdays      text[] not null default '{}' check (weekdays <@ '{MO,TU,WE,TH,FR,SA,SU}'),
  created_at    timestamptz not null default now()
);
create index routines_profile on public.routines (profile_id);

create table public.routine_exercises (
  routine_id  uuid not null references public.routines(id) on delete cascade,
  position    integer not null,
  name        text not null check (trim(name) <> '' and length(name) <= 80),
  sets        integer not null check (sets between 1 and 20),
  reps        integer not null check (reps between 1 and 10000),
  -- 3 x 8 "reps" in all, 8 "per_side", or held for 8 "seconds".
  rep_unit    text not null default 'reps' check (rep_unit in ('reps', 'per_side', 'seconds')),
  load        text check (length(load) <= 60),
  cue         text check (length(cue) <= 300),
  primary key (routine_id, position)
);

create table public.routine_logs (
  id            uuid primary key default gen_random_uuid(),
  routine_id    uuid not null references public.routines(id) on delete cascade,
  household_id  uuid not null references public.households(id) on delete cascade,
  profile_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  done_on       date not null,
  notes         text check (length(notes) <= 2000),
  -- What was done, kept as it was on the day (the routine changes week to week):
  -- [{name, rep_unit, reps: [per set], load}]
  done          jsonb not null default '[]' check (jsonb_typeof(done) = 'array'),
  created_at    timestamptz not null default now()
);
create index routine_logs_routine on public.routine_logs (routine_id, done_on desc);

alter table public.routines          enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.routine_logs      enable row level security;

create policy "Routines: your own" on public.routines for all to authenticated
  using (public.exercise_can_keep(household_id, profile_id, null))
  with check (public.exercise_can_keep(household_id, profile_id, null));
create policy "Routine exercises: with the routine" on public.routine_exercises for all to authenticated
  using (exists (select 1 from public.routines r where r.id = routine_id))
  with check (exists (select 1 from public.routines r where r.id = routine_id));
create policy "Routine logs: your own" on public.routine_logs for all to authenticated
  using (public.exercise_can_keep(household_id, profile_id, null))
  with check (public.exercise_can_keep(household_id, profile_id, null)
              and exists (select 1 from public.routines r where r.id = routine_id));

/**
 * Saves a routine and its exercises together; p_routine null creates one.
 * Exercises: [{name, sets, reps, rep_unit, load, cue}], in order.
 * security invoker: the caller's row-level security applies. The MCP server
 * calls it with the secret key, so it also keeps to p_profile's own routine.
 */
create function public.exercise_save_routine(
  p_routine uuid,
  p_household uuid,
  p_profile uuid,
  p_name text,
  p_category text,
  p_description text,
  p_warm_up text,
  p_progression text,
  p_link text,
  p_rest_seconds integer,
  p_weekdays text[],
  p_exercises jsonb
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  saved uuid;
begin
  if p_routine is null then
    insert into public.routines (household_id, profile_id, name, category, description, warm_up, progression, link, rest_seconds, weekdays)
    values (p_household, p_profile, trim(p_name), p_category, p_description, p_warm_up, p_progression, p_link, p_rest_seconds, coalesce(p_weekdays, '{}'))
    returning id into saved;
  else
    update public.routines
       set name = trim(p_name), category = p_category, description = p_description, warm_up = p_warm_up,
           progression = p_progression, link = p_link, rest_seconds = p_rest_seconds, weekdays = coalesce(p_weekdays, '{}')
     where id = p_routine and household_id = p_household and profile_id = p_profile
    returning id into saved;
    if saved is null then
      raise exception 'routine not found' using errcode = 'P0040';
    end if;
    delete from public.routine_exercises where routine_id = saved;
  end if;

  insert into public.routine_exercises (routine_id, position, name, sets, reps, rep_unit, load, cue)
  select saved, e.n, trim(e.v->>'name'), (e.v->>'sets')::integer, (e.v->>'reps')::integer,
         coalesce(e.v->>'rep_unit', 'reps'), nullif(trim(e.v->>'load'), ''), nullif(trim(e.v->>'cue'), '')
  from jsonb_array_elements(coalesce(p_exercises, '[]')) with ordinality as e(v, n);

  return saved;
end;
$$;
