-- Migration: events_schema (KID-9)
-- Creates tables, indexes, and triggers for the Logbook events system.
-- Recurring events use RFC 5545 RRULE strings; occurrences are computed
-- at query time, not materialised.

-- ============================================================
-- Trigger function: auto-update updated_at on row modification
-- Reusable across any table with an updated_at column.
-- ============================================================
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
comment on function public.update_updated_at_column() is
  'Sets updated_at to now() before each UPDATE. Attach as a BEFORE UPDATE trigger.';
-- ============================================================
-- Table: events
-- ============================================================
create table public.events (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households(id) on delete cascade,
  title              text not null,
  description        text,
  start_at           timestamptz not null,
  end_at             timestamptz not null,
  all_day            boolean not null default false,
  location           text,
  created_by         uuid not null references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  recurrence_rule    text,
  recurrence_ends_at timestamptz,

  constraint events_end_after_start check (end_at >= start_at)
);
comment on table public.events is
  'Calendar events. recurrence_rule holds an RFC 5545 RRULE string; occurrences are computed at query time.';
-- Indexes
create index events_household_start on public.events (household_id, start_at);
create index events_household_range on public.events (household_id, start_at, end_at);
create index events_created_by on public.events (created_by);
create index events_household_recurring on public.events (household_id)
  where recurrence_rule is not null;
-- updated_at trigger
create trigger set_events_updated_at
  before update on public.events
  for each row execute function public.update_updated_at_column();
-- ============================================================
-- Table: event_assignees
-- ============================================================
create table public.event_assignees (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  profile_id   uuid references public.profiles(id) on delete cascade,
  dependent_id uuid references public.dependents(id) on delete cascade,

  constraint assignee_exactly_one_target
    check ((profile_id is not null)::int + (dependent_id is not null)::int = 1)
);
comment on table public.event_assignees is
  'Links events to household members (profiles or dependents). One row per assignee.';
-- Each profile or dependent can only be assigned once per event
create unique index event_assignees_event_profile
  on public.event_assignees (event_id, profile_id)
  where profile_id is not null;
create unique index event_assignees_event_dependent
  on public.event_assignees (event_id, dependent_id)
  where dependent_id is not null;
-- Lookup indexes
create index event_assignees_event on public.event_assignees (event_id);
create index event_assignees_profile on public.event_assignees (profile_id)
  where profile_id is not null;
create index event_assignees_dependent on public.event_assignees (dependent_id)
  where dependent_id is not null;
-- ============================================================
-- Table: event_exceptions
-- ============================================================
create table public.event_exceptions (
  id                uuid primary key default gen_random_uuid(),
  parent_event_id   uuid not null references public.events(id) on delete cascade,
  original_start_at timestamptz not null,
  is_cancelled      boolean not null default false,
  -- Override fields — NULL means inherit from parent event
  title             text,
  description       text,
  start_at          timestamptz,
  end_at            timestamptz,
  location          text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.event_exceptions is
  'Single-occurrence overrides for recurring events. original_start_at is the RECURRENCE-ID per RFC 5545.';
-- Unique: one exception per occurrence
create unique index event_exceptions_parent_original
  on public.event_exceptions (parent_event_id, original_start_at);
-- Lookup index
create index event_exceptions_parent on public.event_exceptions (parent_event_id);
-- updated_at trigger
create trigger set_event_exceptions_updated_at
  before update on public.event_exceptions
  for each row execute function public.update_updated_at_column();
-- ============================================================
-- Enable RLS (policies in next migration)
-- ============================================================
alter table public.events           enable row level security;
alter table public.event_assignees  enable row level security;
alter table public.event_exceptions enable row level security;
