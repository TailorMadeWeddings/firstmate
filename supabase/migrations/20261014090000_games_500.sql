-- One row per game of 500. Player names come from the existing
-- public.profiles.display_name.
--
-- state holds every player's cards, so browsers never read this table:
-- row-level security is on with no policies, and only the app's server
-- (using the secret key) reads and writes it.
create table public.games_500 (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_by uuid not null references auth.users (id),
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  -- User id per seat 0-3. Null is an empty seat while waiting, a computer once playing.
  seats uuid[] not null default array[null, null, null, null]::uuid[],
  state jsonb,
  version integer not null default 0,
  winner_team smallint,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index games_500_seats on public.games_500 using gin (seats);

alter table public.games_500 enable row level security;
