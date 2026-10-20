-- Migration: medical records
-- Appointments, test results, vaccinations, documents and an emergency card
-- (allergies, conditions, Medicare, GP) for each Captain and each child.
-- Captains see and keep the Captains' and the children's. Officers keep
-- their own, private to them, and can read the children's emergency cards.
-- Guests and everyone else see nothing.
-- Appointments put an "Appointment" on the Logbook, with no details, and
-- can leave a reminder on Duties.

/** A record is about exactly one person (a member or a child) in its household. */
create function public.medical_person_ok(p_household uuid, p_profile uuid, p_dependent uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (p_profile is null) <> (p_dependent is null)
     and public.duty_assignee_ok(p_household, p_profile, p_dependent);
$$;

/**
 * Whether the caller may see and keep records about this person: a Captain,
 * for the Captains and the children; anyone in the crew, for themselves.
 */
create function public.medical_can_keep(p_household uuid, p_profile uuid, p_dependent uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (public.is_owner_of(p_household) and (
            p_dependent is not null
            or exists (select 1 from public.household_members m
                       where m.household_id = p_household and m.profile_id = p_profile and m.role = 'owner')))
      or (p_profile = auth.uid() and public.is_crew_of(p_household));
$$;

-- The emergency card: one per person.
create table public.medical_profiles (
  id                     uuid primary key default gen_random_uuid(),
  household_id           uuid not null references public.households(id) on delete cascade,
  profile_id             uuid references public.profiles(id) on delete cascade,
  dependent_id           uuid references public.dependents(id) on delete cascade,
  blood_type             text check (length(blood_type) <= 10),
  allergies              text,
  conditions             text,
  medications            text,
  medicare_number        text check (medicare_number ~ '^[0-9]{10}$'),
  medicare_irn           text check (medicare_irn ~ '^[1-9]$'),
  medicare_expiry        text check (medicare_expiry ~ '^(0[1-9]|1[0-2])/[0-9]{4}$'),
  health_fund            text check (length(health_fund) <= 80),
  health_fund_number     text check (length(health_fund_number) <= 40),
  gp_name                text check (length(gp_name) <= 120),
  gp_clinic              text check (length(gp_clinic) <= 120),
  gp_phone               text check (length(gp_phone) <= 40),
  notes                  text,
  updated_at             timestamptz not null default now(),
  constraint medical_profiles_one_person check ((profile_id is null) <> (dependent_id is null))
);
create unique index medical_profiles_profile on public.medical_profiles (profile_id) where profile_id is not null;
create unique index medical_profiles_dependent on public.medical_profiles (dependent_id) where dependent_id is not null;
create trigger set_medical_profiles_updated_at
  before update on public.medical_profiles
  for each row execute function public.update_updated_at_column();

create table public.medical_appointments (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  profile_id    uuid references public.profiles(id) on delete cascade,
  dependent_id  uuid references public.dependents(id) on delete cascade,
  starts_at     timestamptz not null,
  minutes       integer not null default 30 check (minutes between 5 and 720),
  provider      text check (length(provider) <= 160),
  reason        text,
  outcome       text,
  follow_up     text,
  -- Its "Appointment" on the Logbook, and its reminder on Duties.
  event_id      uuid references public.events(id) on delete set null,
  remind_days   smallint check (remind_days between 0 and 14),
  duty_id       uuid references public.duties(id) on delete set null,
  created_by    uuid not null default auth.uid() references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint medical_appointments_one_person check ((profile_id is null) <> (dependent_id is null))
);
create index medical_appointments_household on public.medical_appointments (household_id, starts_at desc);
create trigger set_medical_appointments_updated_at
  before update on public.medical_appointments
  for each row execute function public.update_updated_at_column();

create table public.medical_results (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  profile_id      uuid references public.profiles(id) on delete cascade,
  dependent_id    uuid references public.dependents(id) on delete cascade,
  taken_on        date not null,
  test            text not null check (trim(test) <> '' and length(test) <= 160),
  result          text,
  reference_range text check (length(reference_range) <= 120),
  notes           text,
  appointment_id  uuid references public.medical_appointments(id) on delete set null,
  created_by      uuid not null default auth.uid() references public.profiles(id),
  created_at      timestamptz not null default now(),
  constraint medical_results_one_person check ((profile_id is null) <> (dependent_id is null))
);
create index medical_results_household on public.medical_results (household_id, taken_on desc);

create table public.medical_vaccinations (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  profile_id    uuid references public.profiles(id) on delete cascade,
  dependent_id  uuid references public.dependents(id) on delete cascade,
  given_on      date not null,
  vaccine       text not null check (trim(vaccine) <> '' and length(vaccine) <= 160),
  -- Which visit on the childhood schedule this was ("2m", "12m", "year7"…), if any.
  schedule_key  text check (length(schedule_key) <= 20),
  dose          text check (length(dose) <= 60),
  provider      text check (length(provider) <= 160),
  batch         text check (length(batch) <= 60),
  notes         text,
  created_by    uuid not null default auth.uid() references public.profiles(id),
  created_at    timestamptz not null default now(),
  constraint medical_vaccinations_one_person check ((profile_id is null) <> (dependent_id is null))
);
create index medical_vaccinations_household on public.medical_vaccinations (household_id, given_on desc);

-- Documents (result PDFs, letters, certificates), for a person and
-- optionally an appointment or a result. The file itself is in storage.
create table public.medical_files (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  profile_id      uuid references public.profiles(id) on delete cascade,
  dependent_id    uuid references public.dependents(id) on delete cascade,
  appointment_id  uuid references public.medical_appointments(id) on delete set null,
  result_id       uuid references public.medical_results(id) on delete set null,
  path            text not null unique,
  name            text not null check (length(name) <= 200),
  size_bytes      integer check (size_bytes >= 0),
  created_by      uuid not null default auth.uid() references public.profiles(id),
  created_at      timestamptz not null default now(),
  constraint medical_files_one_person check ((profile_id is null) <> (dependent_id is null))
);
create index medical_files_household on public.medical_files (household_id, created_at desc);

-- ============================================================
-- Row-level security
-- ============================================================
alter table public.medical_profiles     enable row level security;
alter table public.medical_appointments enable row level security;
alter table public.medical_results      enable row level security;
alter table public.medical_vaccinations enable row level security;
alter table public.medical_files        enable row level security;

-- Emergency cards: as below, plus the crew can read the children's.
create policy "Cards: your own, the family's for Captains, the children's for the crew"
  on public.medical_profiles for select to authenticated
  using (public.medical_can_keep(household_id, profile_id, dependent_id) or (dependent_id is not null and public.is_crew_of(household_id)));
create policy "Cards: kept by whoever may keep them"
  on public.medical_profiles for insert to authenticated
  with check (public.medical_can_keep(household_id, profile_id, dependent_id) and public.medical_person_ok(household_id, profile_id, dependent_id));
create policy "Cards: changed by whoever may keep them"
  on public.medical_profiles for update to authenticated
  using (public.medical_can_keep(household_id, profile_id, dependent_id))
  with check (public.medical_can_keep(household_id, profile_id, dependent_id) and public.medical_person_ok(household_id, profile_id, dependent_id));
create policy "Cards: deleted by whoever may keep them"
  on public.medical_profiles for delete to authenticated
  using (public.medical_can_keep(household_id, profile_id, dependent_id));

-- Everything else: only whoever may keep that person's records.
create policy "Appointments: whoever may keep them" on public.medical_appointments for all to authenticated
  using (public.medical_can_keep(household_id, profile_id, dependent_id))
  with check (public.medical_can_keep(household_id, profile_id, dependent_id) and public.medical_person_ok(household_id, profile_id, dependent_id));
create policy "Results: whoever may keep them" on public.medical_results for all to authenticated
  using (public.medical_can_keep(household_id, profile_id, dependent_id))
  with check (public.medical_can_keep(household_id, profile_id, dependent_id) and public.medical_person_ok(household_id, profile_id, dependent_id));
create policy "Vaccinations: whoever may keep them" on public.medical_vaccinations for all to authenticated
  using (public.medical_can_keep(household_id, profile_id, dependent_id))
  with check (public.medical_can_keep(household_id, profile_id, dependent_id) and public.medical_person_ok(household_id, profile_id, dependent_id));
create policy "Documents: whoever may keep them" on public.medical_files for all to authenticated
  using (public.medical_can_keep(household_id, profile_id, dependent_id))
  with check (public.medical_can_keep(household_id, profile_id, dependent_id) and public.medical_person_ok(household_id, profile_id, dependent_id));

-- ============================================================
-- Saving an appointment keeps its Logbook event in step: titled just
-- "Appointment", for the person it's about, with no other details. With
-- p_remind (days before), it also keeps a reminder on Duties for whoever
-- saved it: who and when, never what for.
-- security invoker: the caller's row-level security applies (Captains
-- have full access to events).
-- ============================================================
create function public.medical_save_appointment(
  p_appointment uuid,
  p_household uuid,
  p_profile uuid,
  p_dependent uuid,
  p_starts timestamptz,
  p_minutes integer,
  p_provider text,
  p_reason text,
  p_outcome text,
  p_follow_up text,
  p_remind integer default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved uuid;
  linked uuid;
  reminder uuid;
  who text;
  due date := (p_starts at time zone 'Australia/Sydney')::date - coalesce(p_remind, 0);
begin
  if p_appointment is null then
    insert into public.medical_appointments (household_id, profile_id, dependent_id, starts_at, minutes, provider, reason, outcome, follow_up)
    values (p_household, p_profile, p_dependent, p_starts, p_minutes, p_provider, p_reason, p_outcome, p_follow_up)
    returning id into saved;
  else
    update public.medical_appointments
       set profile_id = p_profile, dependent_id = p_dependent, starts_at = p_starts, minutes = p_minutes,
           provider = p_provider, reason = p_reason, outcome = p_outcome, follow_up = p_follow_up
     where id = p_appointment
    returning id, event_id, duty_id into saved, linked, reminder;
    if saved is null then
      raise exception 'appointment not found' using errcode = 'P0030';
    end if;
  end if;

  if linked is null then
    insert into public.events (household_id, title, start_at, end_at, created_by)
    values (p_household, 'Appointment', p_starts, p_starts + make_interval(mins => p_minutes), auth.uid())
    returning id into linked;
    update public.medical_appointments set event_id = linked where id = saved;
  else
    update public.events set start_at = p_starts, end_at = p_starts + make_interval(mins => p_minutes) where id = linked;
    delete from public.event_assignees where event_id = linked;
  end if;
  insert into public.event_assignees (event_id, profile_id, dependent_id) values (linked, p_profile, p_dependent);

  update public.medical_appointments set remind_days = p_remind where id = saved;
  if p_remind is null or p_starts <= now() then
    -- No reminder wanted (or it's already happened): drop any old one.
    if reminder is not null then
      update public.medical_appointments set duty_id = null where id = saved;
      delete from public.duties where id = reminder;
    end if;
  else
    select coalesce((select display_name from public.profiles where id = p_profile),
                    (select display_name from public.dependents where id = p_dependent))
      into who;
    if reminder is null then
      insert into public.duties (household_id, title, due_on, important, assigned_profile, created_by)
      values (p_household, 'x', due, true, auth.uid(), auth.uid())
      returning id into reminder;
      update public.medical_appointments set duty_id = reminder where id = saved;
    end if;
    update public.duties
       set title = 'Appointment for ' || who || ', '
                   || trim(to_char(p_starts at time zone 'Australia/Sydney', 'Dy FMDD Mon, FMHH12:MI'))
                   || lower(to_char(p_starts at time zone 'Australia/Sydney', 'am')),
           due_on = due, done_at = null, done_by = null
     where id = reminder;
  end if;

  return saved;
end;
$$;

-- Deleting an appointment takes its Logbook event and its reminder with it.
create function public.medical_appointment_gone()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.event_id is not null then
    delete from public.events where id = old.event_id;
  end if;
  if old.duty_id is not null then
    delete from public.duties where id = old.duty_id;
  end if;
  return old;
end;
$$;
create trigger medical_appointment_gone
  after delete on public.medical_appointments
  for each row execute function public.medical_appointment_gone();

-- ============================================================
-- Documents live in a private bucket under <household id>/. Reading and
-- removing one follows its record: the policy looks it up in medical_files
-- with the caller's own row-level security, so an Officer's documents stay
-- theirs. Anyone in the crew may upload into their household's folder.
-- (objects.name, not name: households has a name column of its own.)
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('medical-files', 'medical-files', false, 20971520, '{application/pdf,image/jpeg,image/png,image/webp,image/heic}');

create policy "Medical files: readable with their record"
  on storage.objects for select to authenticated
  using (bucket_id = 'medical-files' and exists (select 1 from public.medical_files f where f.path = objects.name));
create policy "Medical files: the crew upload to their household"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'medical-files' and exists (
    select 1 from public.households h where h.id::text = (storage.foldername(objects.name))[1] and public.is_crew_of(h.id)
  ));
create policy "Medical files: removed with their record"
  on storage.objects for delete to authenticated
  using (bucket_id = 'medical-files' and exists (select 1 from public.medical_files f where f.path = objects.name));
