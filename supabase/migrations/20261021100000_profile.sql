-- Migration: profile (personal details, a photo, and calendar feeds in and out)

-- ============================================================
-- Personal details. The household sees them, like names and colours;
-- each person changes their own (and Captains anyone's, see logbook).
-- Birthdays are already there, from Voyage.
-- ============================================================
alter table public.profiles
  add column phone text check (length(phone) <= 30),
  add column photo_path text;

-- A photo per person, in a private bucket under <profile id>/.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 5242880, '{image/jpeg,image/png,image/webp}');

create policy "Profile photos: seen by the household"
  on storage.objects for select to authenticated
  using (bucket_id = 'profile-photos' and exists (
    select 1 from public.household_members m
    where m.profile_id::text = (storage.foldername(name))[1]
      and m.household_id in (select public.current_user_household_ids())
  ));
create policy "Profile photos: added by the person"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Profile photos: removed by the person"
  on storage.objects for delete to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- Calendars in: someone's other calendar (Google, Outlook, iCloud) by its
-- secret ICS link. The link is only theirs to see; its events, read in by
-- the app's server every 15 minutes or so, show on the crew's Logbook.
-- ============================================================
create table public.calendar_feeds (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  name          text not null check (length(name) between 1 and 60),
  url           text not null check (url ~ '^https://' and length(url) <= 2000),
  -- When it was last read (or claimed for reading), and why that failed, if it did.
  synced_at     timestamptz,
  problem       text,
  created_at    timestamptz not null default now()
);

-- Its events, repeats already worked out, for a window around today.
create table public.calendar_feed_events (
  id            uuid primary key default gen_random_uuid(),
  feed_id       uuid not null references public.calendar_feeds(id) on delete cascade,
  household_id  uuid not null references public.households(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  title         text not null,
  location      text,
  description   text,
  start_at      timestamptz not null,
  end_at        timestamptz not null,
  all_day       boolean not null default false
);
create index on public.calendar_feed_events (household_id, start_at);
create index on public.calendar_feed_events (feed_id);

alter table public.calendar_feeds        enable row level security;
alter table public.calendar_feed_events  enable row level security;

create policy "Calendar feeds: your own" on public.calendar_feeds for all to authenticated
  using (profile_id = auth.uid() and public.is_crew_of(household_id))
  with check (profile_id = auth.uid() and public.is_crew_of(household_id));
-- Only the app's server (with the secret key) writes them.
create policy "Calendar feed events: the crew's" on public.calendar_feed_events for select to authenticated
  using (public.is_crew_of(household_id));

-- A fresh read of a feed replaces its events in one go; a failed one keeps
-- the old events and says why. Server only.
create function public.calendar_feed_replace(p_feed uuid, p_events jsonb, p_problem text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_problem is null then
    delete from public.calendar_feed_events where feed_id = p_feed;
    insert into public.calendar_feed_events (feed_id, household_id, profile_id, title, location, description, start_at, end_at, all_day)
    select f.id, f.household_id, f.profile_id, e.title, e.location, e.description, e.start_at, e.end_at, e.all_day
      from public.calendar_feeds f,
           jsonb_to_recordset(p_events) as e(title text, location text, description text, start_at timestamptz, end_at timestamptz, all_day boolean)
     where f.id = p_feed;
  end if;
  update public.calendar_feeds set problem = p_problem where id = p_feed;
end;
$$;
revoke execute on function public.calendar_feed_replace(uuid, jsonb, text) from public, anon, authenticated;

-- ============================================================
-- Calendars out: a private link to the Logbook for a phone's calendar
-- app. One per person, kept only as its sha256, like the Health key.
-- ============================================================
create table public.calendar_links (
  profile_id    uuid primary key references public.profiles(id) on delete cascade,
  household_id  uuid not null references public.households(id) on delete cascade,
  key_hash      text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
alter table public.calendar_links enable row level security;
create policy "Calendar links: your own" on public.calendar_links for all to authenticated
  using (profile_id = auth.uid() and public.is_crew_of(household_id))
  with check (profile_id = auth.uid() and public.is_crew_of(household_id));
