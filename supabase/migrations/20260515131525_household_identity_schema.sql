-- Migration: household_identity_schema
-- Creates the foundational identity and household schema.
-- RLS is enabled but policies are added in a later migration (KID-6).

-- ============================================================
-- Enum: the three roles a profile can have in a household
-- ============================================================
create type public.household_role as enum ('owner', 'trusted', 'guest');
-- ============================================================
-- households: the basic family unit. One row for v1 (the Kidds).
-- ============================================================
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
comment on table public.households is
  'A family unit. The Kidd household is the only row in v1.';
-- ============================================================
-- profiles: extends auth.users with display info.
-- Created automatically by the on_auth_user_created trigger below.
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);
comment on table public.profiles is
  'One row per authenticated user. Extends auth.users.';
-- ============================================================
-- household_members: who belongs to which household, with what role.
-- Composite primary key prevents the same profile being added twice.
-- ============================================================
create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id)   on delete cascade,
  role        public.household_role not null,
  joined_at   timestamptz not null default now(),
  primary key (household_id, profile_id)
);
comment on table public.household_members is
  'Links profiles to households with their role. A profile may belong to multiple households.';
-- ============================================================
-- dependents: managed profiles for children. No auth account.
-- ============================================================
create table public.dependents (
  id uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  display_name  text not null,
  date_of_birth date,
  avatar_url    text,
  created_at    timestamptz not null default now()
);
comment on table public.dependents is
  'Managed profiles for children. No auth account. Subject of events, photos, etc.';
-- ============================================================
-- Trigger: auto-create a profile when a new auth user is created.
-- Uses the email local-part as a default display_name; the user
-- can change it later.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
-- ============================================================
-- Backfill: create a profile for any auth.users that already
-- exist (e.g. the test signup you did during KID-2).
-- ============================================================
insert into public.profiles (id, display_name)
select
  id,
  coalesce(raw_user_meta_data->>'display_name', split_part(email, '@', 1))
from auth.users
where id not in (select id from public.profiles)
on conflict do nothing;
-- ============================================================
-- Enable Row-Level Security on all tables.
-- Policies are added in the next migration (KID-6).
-- Until then, default is "deny all" — which is the secure default.
-- ============================================================
alter table public.households        enable row level security;
alter table public.profiles          enable row level security;
alter table public.household_members enable row level security;
alter table public.dependents        enable row level security;
