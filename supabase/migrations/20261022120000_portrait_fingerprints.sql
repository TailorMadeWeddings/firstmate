-- Migration: a Portraits photo can remember its file's SHA-256, so an import
-- keeps one copy of a photo that turns up twice (a story Storypark sent to
-- both twins): the second time, it's tagged with the next child instead.
alter table public.portrait_photos add column sha256 text check (sha256 ~ '^[0-9a-f]{64}$');
create unique index portrait_photos_sha256 on public.portrait_photos (household_id, sha256) where sha256 is not null;
