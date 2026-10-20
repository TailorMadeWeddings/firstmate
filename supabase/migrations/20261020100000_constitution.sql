-- Migration: constitution (KID-23)
-- Personal health tracking. Strictly private: each Owner sees only their own
-- rows. Not other Owners, not Trusted members, not Guests, not anyone else.

/** Whether the caller is an Owner of any household (health tracking is for Owners). */
create function public.is_an_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.household_members where profile_id = auth.uid() and role = 'owner');
$$;

-- One per person: where they started, and their own check-in instructions.
create table public.health_profiles (
  profile_id          uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  baseline_date       date not null,
  baseline_weight_kg  numeric(5,2) check (baseline_weight_kg between 20 and 400),
  baseline_waist_cm   numeric(5,1) check (baseline_waist_cm between 30 and 300),
  -- Replaces the built-in check-in instructions when set (changeable without a deploy).
  checkin_prompt      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger set_health_profiles_updated_at
  before update on public.health_profiles
  for each row execute function public.update_updated_at_column();

-- A weekly entry. Everything but the date is optional: partial weeks are fine.
create table public.health_entries (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  entry_date          date not null,
  weight_kg           numeric(5,2) check (weight_kg between 20 and 400),
  waist_cm            numeric(5,1) check (waist_cm between 30 and 300),
  avg_daily_steps     integer check (avg_daily_steps between 0 and 100000),
  golf_rounds         smallint check (golf_rounds between 0 and 21),
  strength_sessions   smallint check (strength_sessions between 0 and 21),
  avg_cokes_per_day   numeric(4,1) check (avg_cokes_per_day between 0 and 50),
  avg_water_per_day   numeric(4,1) check (avg_water_per_day between 0 and 50),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (profile_id, entry_date)
);
create index health_entries_profile_date on public.health_entries (profile_id, entry_date desc);
create trigger set_health_entries_updated_at
  before update on public.health_entries
  for each row execute function public.update_updated_at_column();

-- The habits being worked on, and their weekly targets, for the check-in and summaries.
create table public.health_habits (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name        text not null check (trim(name) <> '' and length(name) <= 80),
  target      text check (length(target) <= 200),
  active      boolean not null default true,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index health_habits_profile on public.health_habits (profile_id, position);

-- The weekly check-ins Claude wrote, kept so earlier ones can be reread.
create table public.health_checkins (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  entry_id    uuid references public.health_entries(id) on delete set null,
  model       text not null,
  content     text not null check (trim(content) <> ''),
  created_at  timestamptz not null default now()
);
create index health_checkins_profile on public.health_checkins (profile_id, created_at desc);

-- ============================================================
-- Row-level security: your own rows, and only if you're an Owner.
-- ============================================================
alter table public.health_profiles enable row level security;
alter table public.health_entries  enable row level security;
alter table public.health_habits   enable row level security;
alter table public.health_checkins enable row level security;

create policy "Owners keep their own health profile" on public.health_profiles for all to authenticated
  using (profile_id = auth.uid() and public.is_an_owner())
  with check (profile_id = auth.uid() and public.is_an_owner());

create policy "Owners keep their own health entries" on public.health_entries for all to authenticated
  using (profile_id = auth.uid() and public.is_an_owner())
  with check (profile_id = auth.uid() and public.is_an_owner());

create policy "Owners keep their own habits" on public.health_habits for all to authenticated
  using (profile_id = auth.uid() and public.is_an_owner())
  with check (profile_id = auth.uid() and public.is_an_owner());

-- Check-ins are written once and kept: read and add, and delete if you want one gone.
create policy "Owners read their own check-ins" on public.health_checkins for select to authenticated
  using (profile_id = auth.uid() and public.is_an_owner());
create policy "Owners add their own check-ins" on public.health_checkins for insert to authenticated
  with check (profile_id = auth.uid() and public.is_an_owner());
create policy "Owners delete their own check-ins" on public.health_checkins for delete to authenticated
  using (profile_id = auth.uid() and public.is_an_owner());
