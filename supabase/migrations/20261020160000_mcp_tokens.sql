-- Migration: mcp_tokens (Claude's connector signs in with OAuth)
-- A row per approval: first a short-lived code for the app to swap, then
-- the token it keeps, which acts as the person who approved it. Only hashes
-- are kept. Read and written only by the app's server with the secret key:
-- row-level security is on with no policies.

create table public.mcp_tokens (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  household_id     uuid not null references public.households(id) on delete cascade,
  -- Where it was approved for, e.g. claude.ai.
  client           text not null,
  code_hash        text unique,
  code_challenge   text,
  redirect_uri     text,
  code_expires_at  timestamptz,
  token_hash       text unique,
  created_at       timestamptz not null default now()
);
alter table public.mcp_tokens enable row level security;
