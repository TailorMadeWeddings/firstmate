-- Enable Supabase Realtime for events tables (KID-11)
alter publication supabase_realtime add table events, event_assignees, event_exceptions;
