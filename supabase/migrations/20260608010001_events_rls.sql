-- Migration: events_rls (KID-9)
-- Row-level security policies for the events tables.
-- Uses existing helper functions: current_user_household_ids(), is_owner_of().

-- ============================================================
-- Policies: events
-- ============================================================

-- Owners have full access to all events in their household.
create policy "Owners have full access to events"
  on public.events for all
  to authenticated
  using (
    household_id in (select public.current_user_household_ids())
    and public.is_owner_of(household_id)
  )
  with check (
    household_id in (select public.current_user_household_ids())
    and public.is_owner_of(household_id)
  );
-- Trusted members can read all events in their household.
create policy "Trusted members can view household events"
  on public.events for select
  to authenticated
  using (
    household_id in (select public.current_user_household_ids())
  );
-- Trusted members can create events in their household (must set created_by = self).
create policy "Trusted members can create events"
  on public.events for insert
  to authenticated
  with check (
    household_id in (select public.current_user_household_ids())
    and created_by = auth.uid()
  );
-- Trusted members can update their own events.
create policy "Trusted members can update own events"
  on public.events for update
  to authenticated
  using (
    household_id in (select public.current_user_household_ids())
    and created_by = auth.uid()
  )
  with check (
    household_id in (select public.current_user_household_ids())
    and created_by = auth.uid()
  );
-- Trusted members can delete their own events.
create policy "Trusted members can delete own events"
  on public.events for delete
  to authenticated
  using (
    household_id in (select public.current_user_household_ids())
    and created_by = auth.uid()
  );
-- NOTE: Guest event sharing (FOR SELECT on explicitly shared events)
-- is intentionally deferred to a future issue.

-- ============================================================
-- Policies: event_assignees
-- ============================================================

-- Anyone who can see the parent event can see its assignees.
create policy "Readable if parent event is visible"
  on public.event_assignees for select
  to authenticated
  using (
    exists (
      select 1 from public.events
      where id = event_assignees.event_id
    )
  );
-- Owners can manage assignees on any household event.
create policy "Owners can manage assignees"
  on public.event_assignees for all
  to authenticated
  using (
    exists (
      select 1 from public.events
      where id = event_assignees.event_id
        and public.is_owner_of(events.household_id)
    )
  )
  with check (
    exists (
      select 1 from public.events
      where id = event_assignees.event_id
        and public.is_owner_of(events.household_id)
    )
  );
-- Trusted members can manage assignees on events they created.
create policy "Trusted members can manage assignees on own events"
  on public.event_assignees for all
  to authenticated
  using (
    exists (
      select 1 from public.events
      where id = event_assignees.event_id
        and created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.events
      where id = event_assignees.event_id
        and created_by = auth.uid()
    )
  );
-- ============================================================
-- Policies: event_exceptions
-- ============================================================

-- Anyone who can see the parent event can see its exceptions.
create policy "Readable if parent event is visible"
  on public.event_exceptions for select
  to authenticated
  using (
    exists (
      select 1 from public.events
      where id = event_exceptions.parent_event_id
    )
  );
-- Owners can manage exceptions on any household event.
create policy "Owners can manage exceptions"
  on public.event_exceptions for all
  to authenticated
  using (
    exists (
      select 1 from public.events
      where id = event_exceptions.parent_event_id
        and public.is_owner_of(events.household_id)
    )
  )
  with check (
    exists (
      select 1 from public.events
      where id = event_exceptions.parent_event_id
        and public.is_owner_of(events.household_id)
    )
  );
-- Trusted members can manage exceptions on events they created.
create policy "Trusted members can manage exceptions on own events"
  on public.event_exceptions for all
  to authenticated
  using (
    exists (
      select 1 from public.events
      where id = event_exceptions.parent_event_id
        and created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.events
      where id = event_exceptions.parent_event_id
        and created_by = auth.uid()
    )
  );
-- ============================================================
-- Smoke-test SQL snippets (manual verification)
-- ============================================================
/*
-- 1. Owner can insert and select an event
-- (Run as an Owner-role user via Supabase SQL editor with RLS enabled)

INSERT INTO events (household_id, title, start_at, end_at, created_by)
VALUES (
  '<household_id>',
  'Family dinner',
  '2026-06-10T18:00:00Z',
  '2026-06-10T19:30:00Z',
  auth.uid()
)
RETURNING *;

SELECT * FROM events WHERE household_id = '<household_id>';

-- 2. Trusted member can insert an event and read all household events
-- (Run as a Trusted-role user)

INSERT INTO events (household_id, title, start_at, end_at, created_by)
VALUES (
  '<household_id>',
  'Soccer practice',
  '2026-06-11T16:00:00Z',
  '2026-06-11T17:00:00Z',
  auth.uid()
)
RETURNING *;

SELECT * FROM events WHERE household_id = '<household_id>';
-- ^ Should return both 'Family dinner' and 'Soccer practice'

-- 3. Trusted member cannot update an event they didn't create

UPDATE events
SET title = 'Hijacked dinner'
WHERE title = 'Family dinner';
-- ^ Should update 0 rows (not their event)

-- 4. Multi-assignee event with both a profile and a dependent

INSERT INTO event_assignees (event_id, profile_id)
VALUES ('<event_id>', '<profile_id>');

INSERT INTO event_assignees (event_id, dependent_id)
VALUES ('<event_id>', '<dependent_id>');

SELECT * FROM event_assignees WHERE event_id = '<event_id>';
-- ^ Should return 2 rows

-- 5. Event exception resolves against parent

INSERT INTO events (household_id, title, start_at, end_at, created_by, recurrence_rule)
VALUES (
  '<household_id>',
  'Weekly standup',
  '2026-06-08T09:00:00Z',
  '2026-06-08T09:30:00Z',
  auth.uid(),
  'FREQ=WEEKLY;BYDAY=MO'
)
RETURNING id;

INSERT INTO event_exceptions (parent_event_id, original_start_at, is_cancelled)
VALUES ('<parent_id>', '2026-06-15T09:00:00Z', true);
-- ^ Cancels the June 15 occurrence

INSERT INTO event_exceptions (parent_event_id, original_start_at, title, start_at, end_at)
VALUES ('<parent_id>', '2026-06-22T09:00:00Z', 'Delayed standup', '2026-06-22T10:00:00Z', '2026-06-22T10:30:00Z');
-- ^ Reschedules the June 22 occurrence to 10:00

SELECT * FROM event_exceptions WHERE parent_event_id = '<parent_id>';
-- ^ Should return 2 rows: one cancelled, one rescheduled
*/;
