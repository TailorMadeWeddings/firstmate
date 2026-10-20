-- Migration: health
-- Apple Health's daily numbers (steps, heart rate, active energy, exercise
-- minutes), sent by an iPhone Shortcut to /api/health with a personal key.
-- A website can't read HealthKit, so the phone posts them.
-- Private, like the rest of Exercise: each person sees only their own.

create table public.health_daily (
  household_id      uuid not null references public.households(id) on delete cascade,
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  day               date not null,
  steps             integer check (steps between 0 and 200000),
  resting_hr        integer check (resting_hr between 20 and 250),
  avg_hr            integer check (avg_hr between 20 and 250),
  active_kcal       integer check (active_kcal between 0 and 20000),
  exercise_minutes  integer check (exercise_minutes between 0 and 1440),
  updated_at        timestamptz not null default now(),
  primary key (profile_id, day)
);

-- The Shortcut's key: one per person, kept only as its sha256.
create table public.health_keys (
  profile_id    uuid primary key references public.profiles(id) on delete cascade,
  household_id  uuid not null references public.households(id) on delete cascade,
  key_hash      text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

alter table public.health_daily enable row level security;
alter table public.health_keys  enable row level security;

-- Only the import (/api/health, with the secret key) writes the numbers.
create policy "Health: your own" on public.health_daily for select to authenticated
  using (public.exercise_can_keep(household_id, profile_id, null));
create policy "Health keys: your own" on public.health_keys for all to authenticated
  using (public.exercise_can_keep(household_id, profile_id, null))
  with check (public.exercise_can_keep(household_id, profile_id, null));
