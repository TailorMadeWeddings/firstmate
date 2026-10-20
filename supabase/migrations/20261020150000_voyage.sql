-- Migration: Voyage, each person's life journal
-- A book for each child and each Captain, from before they were born and on
-- through every year after: the baby book's pages, then a page a year, school
-- years, activities, firsts, sayings and letters. Family pages (homes, pets,
-- relatives, shared moments, the news of a year) are written once, with a
-- section for each person.
-- Captains keep every book, their own and each other's included. Officers
-- (grandparents, say) can tell stories about anyone in the books, and see
-- only the stories they told. Guests and everyone else see nothing.

-- A Captain's birthday, so their book knows how old they were.
alter table public.profiles add column date_of_birth date;

/**
 * Who a Voyage page can be about: nobody (a family page), a child in the
 * household, or one of its Captains. Officers don't have books.
 */
create function public.voyage_subject_ok(p_household uuid, p_profile uuid, p_dependent uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_profile is null and p_dependent is null then true
    when p_profile is not null and p_dependent is not null then false
    when p_dependent is not null then exists (
      select 1 from public.dependents d where d.household_id = p_household and d.id = p_dependent)
    else exists (
      select 1 from public.household_members m
       where m.household_id = p_household and m.profile_id = p_profile and m.role = 'owner')
  end;
$$;

-- A page: which template it follows (see lib/voyage.ts), which month, age,
-- school year or calendar year it's for, and what was written. The fields
-- each template asks for live in `fields`, so new prompts need no migration.
create table public.voyage_entries (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  profile_id    uuid references public.profiles(id) on delete cascade,
  dependent_id  uuid references public.dependents(id) on delete cascade,
  template      text not null check (template ~ '^[a-z][a-z-]{0,39}$'),
  -- 0 for a one-off page; the month, age, school year or calendar year for
  -- a repeating one; null for a collection (firsts, sayings…), which has many.
  period        integer check (period between 0 and 3000),
  title         text check (length(title) <= 300),
  occurred_on   date,
  fields        jsonb not null default '{}' check (jsonb_typeof(fields) = 'object'),
  body          text,
  created_by    uuid not null default auth.uid() references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint voyage_entries_one_subject check (profile_id is null or dependent_id is null)
);
-- One page per person per slot ("month 3", "age 7"); collections are unlimited.
create unique index voyage_entries_slot
  on public.voyage_entries (household_id, profile_id, dependent_id, template, period) nulls not distinct
  where period is not null;
create index voyage_entries_profile on public.voyage_entries (profile_id) where profile_id is not null;
create index voyage_entries_dependent on public.voyage_entries (dependent_id) where dependent_id is not null;
create trigger set_voyage_entries_updated_at
  before update on public.voyage_entries
  for each row execute function public.update_updated_at_column();

-- Words about one person: their section of a family page (entry_id set,
-- written by a Captain), or a story an Officer or Captain told (no entry).
create table public.voyage_notes (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  entry_id      uuid references public.voyage_entries(id) on delete cascade,
  profile_id    uuid references public.profiles(id) on delete cascade,
  dependent_id  uuid references public.dependents(id) on delete cascade,
  title         text check (length(title) <= 300),
  occurred_on   date,
  body          text not null check (length(body) between 1 and 20000),
  created_by    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint voyage_notes_one_person check ((profile_id is null) <> (dependent_id is null))
);
create unique index voyage_notes_section
  on public.voyage_notes (entry_id, profile_id, dependent_id) nulls not distinct
  where entry_id is not null;
create index voyage_notes_household on public.voyage_notes (household_id, created_at desc);
create trigger set_voyage_notes_updated_at
  before update on public.voyage_notes
  for each row execute function public.update_updated_at_column();

-- Photos on a page or a story. The file is in the voyage-photos bucket.
create table public.voyage_photos (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  entry_id      uuid references public.voyage_entries(id) on delete cascade,
  note_id       uuid references public.voyage_notes(id) on delete cascade,
  path          text not null unique,
  created_by    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  constraint voyage_photos_one_parent check ((entry_id is null) <> (note_id is null))
);
create index voyage_photos_entry on public.voyage_photos (entry_id) where entry_id is not null;
create index voyage_photos_note on public.voyage_photos (note_id) where note_id is not null;

-- ============================================================
-- Row-level security
-- ============================================================
alter table public.voyage_entries enable row level security;
alter table public.voyage_notes   enable row level security;
alter table public.voyage_photos  enable row level security;

create policy "Voyage pages: kept by the Captains" on public.voyage_entries for all to authenticated
  using (public.is_owner_of(household_id))
  with check (public.is_owner_of(household_id) and public.voyage_subject_ok(household_id, profile_id, dependent_id));

-- Captains see and tidy every note; Officers only the stories they told.
create policy "Voyage notes: Captains, and whoever told the story" on public.voyage_notes for select to authenticated
  using (public.is_owner_of(household_id) or (created_by = auth.uid() and public.is_crew_of(household_id)));
create policy "Voyage notes: Captains write sections and stories, Officers stories" on public.voyage_notes for insert to authenticated
  with check (
    created_by = auth.uid()
    and (profile_id is not null or dependent_id is not null)
    and public.voyage_subject_ok(household_id, profile_id, dependent_id)
    and (
      (public.is_owner_of(household_id) and (entry_id is null or exists (
        select 1 from public.voyage_entries e where e.id = entry_id and e.household_id = voyage_notes.household_id)))
      or (entry_id is null and public.is_crew_of(household_id))
    )
  );
create policy "Voyage notes: changed by Captains, and whoever told the story" on public.voyage_notes for update to authenticated
  using (public.is_owner_of(household_id) or (created_by = auth.uid() and public.is_crew_of(household_id)))
  with check (
    public.voyage_subject_ok(household_id, profile_id, dependent_id)
    and (public.is_owner_of(household_id) or (created_by = auth.uid() and entry_id is null and public.is_crew_of(household_id)))
  );
create policy "Voyage notes: deleted by Captains, and whoever told the story" on public.voyage_notes for delete to authenticated
  using (public.is_owner_of(household_id) or (created_by = auth.uid() and public.is_crew_of(household_id)));

-- Photos follow what they're on: the parent must be visible to the caller
-- (an Officer sees only their own stories, so only their own photos).
create policy "Voyage photos: with their page or story" on public.voyage_photos for select to authenticated
  using (
    exists (select 1 from public.voyage_entries e where e.id = entry_id)
    or exists (select 1 from public.voyage_notes n where n.id = note_id)
  );
create policy "Voyage photos: added to a page or story you can change" on public.voyage_photos for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      exists (select 1 from public.voyage_entries e where e.id = entry_id and e.household_id = voyage_photos.household_id)
      or exists (select 1 from public.voyage_notes n where n.id = note_id and n.household_id = voyage_photos.household_id)
    )
  );
create policy "Voyage photos: removed by Captains, and whoever added them" on public.voyage_photos for delete to authenticated
  using (public.is_owner_of(household_id) or (created_by = auth.uid() and public.is_crew_of(household_id)));

-- ============================================================
-- Photos live in a private bucket under <household id>/. Reading one
-- follows its voyage_photos row, with the caller's own row-level security;
-- removing one, whoever may remove the row. Anyone in the crew may upload
-- to their household.
-- (objects.name, not name: households has a name column of its own.)
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voyage-photos', 'voyage-photos', false, 10485760, '{image/jpeg}');

create policy "Voyage photos: readable with their row"
  on storage.objects for select to authenticated
  using (bucket_id = 'voyage-photos' and exists (select 1 from public.voyage_photos p where p.path = objects.name));
create policy "Voyage photos: the crew upload to their household"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'voyage-photos' and exists (
    select 1 from public.households h where h.id::text = (storage.foldername(objects.name))[1] and public.is_crew_of(h.id)
  ));
create policy "Voyage photos: removed with their row"
  on storage.objects for delete to authenticated
  using (bucket_id = 'voyage-photos' and exists (
    select 1 from public.voyage_photos p
     where p.path = objects.name and (public.is_owner_of(p.household_id) or p.created_by = auth.uid())
  ));
