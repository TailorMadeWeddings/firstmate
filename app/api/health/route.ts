// Apple Health's daily numbers, posted by an iPhone Shortcut with the
// person's key: Authorization: Bearer fm_…, and a JSON body of one day
// ({ "steps": 8432, "resting_hr": 58, … }) or a list of days. Each day
// replaces what was there, so sending the same day again is harmless.
import { NextResponse } from "next/server";
import { hashKey, readHealthDays } from "@/lib/health";
import { dayKey } from "@/lib/logbook";
import { createAdminClient } from "@/lib/supabase/admin";

const reply = (status: number, body: object) => NextResponse.json(body, { status });

export async function POST(request: Request) {
  const key = request.headers.get("authorization")?.match(/^Bearer\s+(fm_[\w-]{20,100})\s*$/i)?.[1];
  if (!key) return reply(401, { error: "Send your key from Exercise as: Authorization: Bearer fm_…" });

  // The secret key skips row-level security, so the key decides whose numbers these are.
  const admin = createAdminClient();
  const { data: owner, error: lookup } = await admin.from("health_keys").select("profile_id, household_id").eq("key_hash", hashKey(key)).maybeSingle();
  if (lookup) return failed(lookup);
  if (!owner) return reply(401, { error: "That key isn't in use. Make a new one in Exercise." });
  const { data: member } = await admin
    .from("household_members")
    .select("role")
    .eq("household_id", owner.household_id)
    .eq("profile_id", owner.profile_id)
    .neq("role", "guest")
    .maybeSingle();
  if (!member) return reply(403, { error: "You're no longer in the crew." });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply(400, { error: "The body should be JSON." });
  }
  const days = readHealthDays(body, dayKey(new Date()));
  if (typeof days === "string") return reply(400, { error: days });

  const now = new Date().toISOString();
  const { error } = await admin
    .from("health_daily")
    .upsert(days.map((d) => ({ ...d, profile_id: owner.profile_id, household_id: owner.household_id, updated_at: now })), { onConflict: "profile_id,day" });
  if (error) return failed(error);
  await admin.from("health_keys").update({ last_used_at: now }).eq("profile_id", owner.profile_id);
  return reply(200, { saved: days.map((d) => d.day) });
}

function failed(error: unknown) {
  console.error(error);
  return reply(500, { error: "Couldn't save that. Try again." });
}
