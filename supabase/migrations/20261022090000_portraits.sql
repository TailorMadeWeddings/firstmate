-- Migration: Portraits, the family's photos
-- The household's photos, for the whole crew: Captains and Officers see every
-- photo, upload, caption and tag them (with the people in them and with
-- words), and put them in albums. A photo can be in any number of albums, or
-- none. An album is renamed or deleted by a Captain or whoever made it; a
-- photo is deleted by a Captain or whoever uploaded it. Guests see nothing.
-- Voyage's pages and stories can show Portraits photos too (at the end).

-- A photo. The file is in the portrait-photos bucket.
create table public.portrait_photos (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  -- <household id>/<uuid>.jpg, so a row can only ever point at its own household's files.
  path          text not null unique check (path ~ ('^' || household_id::text || '/[0-9a-f-]{36}\.jpg$')),
  caption       text check (length(caption) <= 2000),
  -- From the camera's record in the file when it has one, else the upload day.
  taken_on      date not null default (now() at time zone 'Australia/Sydney')::date,
  created_by    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now()
);
create index portrait_photos_household on public.portrait_photos (household_id, taken_on desc, created_at desc);
create index portrait_photos_day on public.portrait_photos (household_id, extract(month from taken_on), extract(day from taken_on));
-- Only the caption and the day it was taken change after upload.
revoke update on public.portrait_photos from anon, authenticated;
grant update (caption, taken_on) on public.portrait_photos to authenticated;

/** Photos taken on this day in earlier years, newest first. Row-level security applies (security invoker). */
create function public.portraits_on_this_day(p_today date)
returns setof public.portrait_photos language sql stable set search_path = '' as $$
  select * from public.portrait_photos
   where extract(month from taken_on) = extract(month from p_today)
     and extract(day from taken_on) = extract(day from p_today)
     and taken_on < p_today
   order by taken_on desc, created_at desc
   limit 12;
$$;

create table public.portrait_albums (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  title          text not null check (length(title) between 1 and 200),
  taken_on       date,
  description    text check (length(description) <= 5000),
  -- The photo on the album's card; the first one added if not chosen.
  cover_photo_id uuid references public.portrait_photos(id) on delete set null,
  created_by     uuid not null default auth.uid() references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index portrait_albums_household on public.portrait_albums (household_id, taken_on desc nulls last);
create trigger set_portrait_albums_updated_at
  before update on public.portrait_albums
  for each row execute function public.update_updated_at_column();

-- Which albums a photo is in.
create table public.portrait_album_photos (
  album_id      uuid not null references public.portrait_albums(id) on delete cascade,
  photo_id      uuid not null references public.portrait_photos(id) on delete cascade,
  household_id  uuid not null references public.households(id) on delete cascade,
  added_at      timestamptz not null default now(),
  primary key (album_id, photo_id)
);
create index portrait_album_photos_photo on public.portrait_album_photos (photo_id);

-- A tag on a photo: someone in it (a person in the household, or a child),
-- or a word ("beach", "christmas 2025"), always lower case.
create table public.portrait_tags (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  photo_id      uuid not null references public.portrait_photos(id) on delete cascade,
  profile_id    uuid references public.profiles(id) on delete cascade,
  dependent_id  uuid references public.dependents(id) on delete cascade,
  word          text check (word = lower(word) and length(word) between 1 and 40),
  constraint portrait_tags_one_kind check (num_nonnulls(profile_id, dependent_id, word) = 1)
);
create unique index portrait_tags_once on public.portrait_tags (photo_id, profile_id, dependent_id, word) nulls not distinct;
create index portrait_tags_profile on public.portrait_tags (profile_id) where profile_id is not null;
create index portrait_tags_dependent on public.portrait_tags (dependent_id) where dependent_id is not null;
create index portrait_tags_word on public.portrait_tags (household_id, word) where word is not null;

-- ============================================================
-- Row-level security
-- ============================================================
alter table public.portrait_photos       enable row level security;
alter table public.portrait_albums       enable row level security;
alter table public.portrait_album_photos enable row level security;
alter table public.portrait_tags         enable row level security;

create policy "Portrait photos: seen by the crew" on public.portrait_photos for select to authenticated
  using (public.is_crew_of(household_id));
create policy "Portrait photos: uploaded by the crew" on public.portrait_photos for insert to authenticated
  with check (created_by = auth.uid() and public.is_crew_of(household_id));
create policy "Portrait photos: captioned by the crew" on public.portrait_photos for update to authenticated
  using (public.is_crew_of(household_id))
  with check (public.is_crew_of(household_id));
create policy "Portrait photos: deleted by Captains, and whoever uploaded them" on public.portrait_photos for delete to authenticated
  using (public.is_owner_of(household_id) or (created_by = auth.uid() and public.is_crew_of(household_id)));

create policy "Portrait albums: seen by the crew" on public.portrait_albums for select to authenticated
  using (public.is_crew_of(household_id));
create policy "Portrait albums: made by the crew" on public.portrait_albums for insert to authenticated
  with check (created_by = auth.uid() and public.is_crew_of(household_id) and cover_photo_id is null);
create policy "Portrait albums: changed by Captains, and whoever made them" on public.portrait_albums for update to authenticated
  using (public.is_owner_of(household_id) or (created_by = auth.uid() and public.is_crew_of(household_id)))
  with check (
    public.is_crew_of(household_id)
    and (cover_photo_id is null or exists (
      select 1 from public.portrait_photos p where p.id = cover_photo_id and p.household_id = portrait_albums.household_id))
  );
create policy "Portrait albums: deleted by Captains, and whoever made them" on public.portrait_albums for delete to authenticated
  using (public.is_owner_of(household_id) or (created_by = auth.uid() and public.is_crew_of(household_id)));

-- Putting photos in albums and taking them out is for anyone in the crew:
-- the photo itself stays either way.
create policy "Portrait album photos: seen by the crew" on public.portrait_album_photos for select to authenticated
  using (public.is_crew_of(household_id));
create policy "Portrait album photos: added by the crew" on public.portrait_album_photos for insert to authenticated
  with check (
    public.is_crew_of(household_id)
    and exists (select 1 from public.portrait_albums a where a.id = album_id and a.household_id = portrait_album_photos.household_id)
    and exists (select 1 from public.portrait_photos p where p.id = photo_id and p.household_id = portrait_album_photos.household_id)
  );
create policy "Portrait album photos: taken out by the crew" on public.portrait_album_photos for delete to authenticated
  using (public.is_crew_of(household_id));

create policy "Portrait tags: seen by the crew" on public.portrait_tags for select to authenticated
  using (public.is_crew_of(household_id));
create policy "Portrait tags: added by the crew, about the household" on public.portrait_tags for insert to authenticated
  with check (
    public.is_crew_of(household_id)
    and exists (select 1 from public.portrait_photos p where p.id = photo_id and p.household_id = portrait_tags.household_id)
    and (profile_id is null or exists (
      select 1 from public.household_members m where m.household_id = portrait_tags.household_id and m.profile_id = portrait_tags.profile_id))
    and (dependent_id is null or exists (
      select 1 from public.dependents d where d.household_id = portrait_tags.household_id and d.id = portrait_tags.dependent_id))
  );
create policy "Portrait tags: removed by the crew" on public.portrait_tags for delete to authenticated
  using (public.is_crew_of(household_id));

-- ============================================================
-- Photos live in a private bucket under <household id>/. Reading one
-- follows its portrait_photos row. Anyone in the crew may upload to their
-- household. Files are removed by the server, once their row has gone.
-- (objects.name, not name: households has a name column of its own.)
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portrait-photos', 'portrait-photos', false, 10485760, '{image/jpeg}');

create policy "Portrait photos: readable with their row"
  on storage.objects for select to authenticated
  using (bucket_id = 'portrait-photos' and exists (select 1 from public.portrait_photos p where p.path = objects.name));
create policy "Portrait photos: the crew upload to their household"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'portrait-photos' and exists (
    select 1 from public.households h where h.id::text = (storage.foldername(objects.name))[1] and public.is_crew_of(h.id)
  ));

-- ============================================================
-- Voyage: a page or story can show a Portraits photo instead of its own
-- upload. The file stays in Portraits; removing it from the page only
-- removes the link.
-- ============================================================
alter table public.voyage_photos
  alter column path drop not null,
  add column portrait_photo_id uuid references public.portrait_photos(id) on delete cascade,
  add constraint voyage_photos_one_file check (num_nonnulls(path, portrait_photo_id) = 1);
create unique index voyage_photos_portrait on public.voyage_photos (entry_id, note_id, portrait_photo_id) nulls not distinct
  where portrait_photo_id is not null;

drop policy "Voyage photos: added to a page or story you can change" on public.voyage_photos;
create policy "Voyage photos: added to a page or story you can change" on public.voyage_photos for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      exists (select 1 from public.voyage_entries e where e.id = entry_id and e.household_id = voyage_photos.household_id)
      or exists (select 1 from public.voyage_notes n where n.id = note_id and n.household_id = voyage_photos.household_id)
    )
    and (portrait_photo_id is null or exists (
      select 1 from public.portrait_photos p where p.id = portrait_photo_id and p.household_id = voyage_photos.household_id))
  );
