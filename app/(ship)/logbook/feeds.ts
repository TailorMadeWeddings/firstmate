// Reading the crew's other calendars (their ICS feeds) into the Logbook.
// Runs with the secret key, since a feed's events are for the whole crew to
// see but only the server writes them; every write keeps to one feed's row.
import { FEED_DAYS_AFTER, FEED_DAYS_BEFORE, readFeed } from "@/lib/calendars";
import { addDays, dayKey, startOfDay } from "@/lib/logbook";
import { createAdminClient } from "@/lib/supabase/admin";

const STALE_MINUTES = 15;
const MAX_CHARS = 10_000_000;

/** A reason worth showing the person; anything else is logged. */
class Unreadable extends Error {}

/** Reads a feed now and replaces its events. Why it couldn't, or null. */
export async function syncFeed(id: string, url: string): Promise<string | null> {
  const today = dayKey(new Date());
  let events = null;
  let problem: string | null = null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store", headers: { accept: "text/calendar" } });
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      throw new Unreadable("That calendar link doesn't work. Is it the secret (private) address?");
    }
    if (!res.ok) throw new Unreadable(`The calendar's server said ${res.status}. It'll try again shortly.`);
    if (Number(res.headers.get("content-length") ?? 0) > MAX_CHARS) throw new Unreadable("That calendar is too big to read.");
    const ics = await res.text();
    if (ics.length > MAX_CHARS) throw new Unreadable("That calendar is too big to read.");
    if (!ics.includes("BEGIN:VCALENDAR")) throw new Unreadable("That link isn't a calendar (ICS) feed.");
    events = readFeed(ics, startOfDay(addDays(today, -FEED_DAYS_BEFORE)), startOfDay(addDays(today, FEED_DAYS_AFTER)));
  } catch (e) {
    if (!(e instanceof Unreadable)) console.error(e);
    problem = e instanceof Unreadable ? e.message : "Couldn't read that calendar. Check the link.";
  }
  const { error } = await createAdminClient().rpc("calendar_feed_replace", { p_feed: id, p_events: events, p_problem: problem });
  if (error) {
    console.error(error);
    return "Couldn't save its events. Try again.";
  }
  return problem;
}

/**
 * Reads any of a household's feeds not read in the last 15 minutes. Claiming
 * them first (in one update) means two page loads never read the same one.
 */
export async function refreshFeeds(householdId: string): Promise<void> {
  const stale = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
  const { data, error } = await createAdminClient()
    .from("calendar_feeds")
    .update({ synced_at: new Date().toISOString() })
    .eq("household_id", householdId)
    .or(`synced_at.is.null,synced_at.lt.${stale}`)
    .select("id, url");
  if (error) return console.error(error);
  await Promise.all((data as { id: string; url: string }[]).map((f) => syncFeed(f.id, f.url)));
}
