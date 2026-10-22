// The Logbook as an ICS feed, for a phone's calendar app to subscribe to:
// /api/calendar/<key>.ics, with the key made on someone's profile. The key
// is the only sign-in, so this keeps to the key holder's household. Other
// calendars read into the Logbook stay out: they aren't the Logbook's to share.
import { FEED_DAYS_AFTER, FEED_DAYS_BEFORE, writeFeed } from "@/lib/calendars";
import { hashKey } from "@/lib/health";
import { addDays, dayKey, startOfDay } from "@/lib/logbook";
import { createAdminClient } from "@/lib/supabase/admin";
import { logbookEntries } from "../../../(ship)/logbook/data";

export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  const key = (await params).file.replace(/\.ics$/, "");
  const db = createAdminClient();
  const { data: link } = await db
    .from("calendar_links")
    .update({ last_used_at: new Date().toISOString() })
    .eq("key_hash", hashKey(key))
    .select("household_id, households(name)")
    .maybeSingle<{ household_id: string; households: { name: string } | null }>();
  if (!link) return new Response("That calendar link has been turned off.", { status: 404 });

  const today = dayKey(new Date());
  const entries = await logbookEntries(db, startOfDay(addDays(today, -FEED_DAYS_BEFORE)), startOfDay(addDays(today, FEED_DAYS_AFTER)), link.household_id);
  return new Response(writeFeed(`${link.households?.name ?? "First Mate"} Logbook`, entries), {
    headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, no-store" },
  });
}
