-- Migration: kitchen_pins (KID-8, KID-34)
-- Owner PINs that unlock the Ledger on the kitchen screen (The Helm).
-- Hashes (scrypt, salted) are read and written only by the app's server
-- with the secret key: row-level security is on with no policies, so no
-- browser can read them, not even the owner's own.
create table public.kitchen_pins (
  profile_id    uuid primary key references public.profiles(id) on delete cascade,
  household_id  uuid not null references public.households(id) on delete cascade,
  pin_hash      text not null,
  updated_at    timestamptz not null default now()
);
alter table public.kitchen_pins enable row level security;

-- Wrong PINs on the kitchen screen, so guessing can be slowed down: after
-- five in a row, unlocking pauses for a few minutes.
alter table public.households
  add column kitchen_failed_pins integer not null default 0,
  add column kitchen_locked_until timestamptz;
