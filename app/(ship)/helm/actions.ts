"use server";

// The kitchen screen: turning kitchen mode on and off, PIN unlock and lock,
// and owners setting their own PIN. PINs and the wrong-PIN pause live where
// only this server can read them (the secret-key client).
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MAX_WRONG_PINS, UNLOCK_MINUTES, afterWrongPin, hashPin, isPin, pinMatches, signUnlock } from "@/lib/kitchen";
import { KITCHEN_COOKIE, UNLOCK_COOKIE, currentMember, kitchenState, unlockKey } from "@/lib/players";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = string | null;

const cookie = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

/** Only paths on this site, so the PIN form can't bounce someone elsewhere. */
const safe = (next: string) => (next.startsWith("/") && !next.startsWith("//") ? next : "/");

/** Owner PINs for a household: only people who are owners right now count. */
async function ownerPins(householdId: string) {
  const admin = createAdminClient();
  const [{ data: pins, error }, { data: owners, error: e2 }] = await Promise.all([
    admin.from("kitchen_pins").select("profile_id, pin_hash").eq("household_id", householdId),
    admin.from("household_members").select("profile_id").eq("household_id", householdId).eq("role", "owner"),
  ]);
  if (error || e2) throw error ?? e2;
  const ownerIds = new Set(owners.map((o) => o.profile_id));
  return pins.filter((p) => ownerIds.has(p.profile_id));
}

export async function enterKitchen(): Promise<Result> {
  const member = await currentMember();
  // Without a PIN nobody could unlock the Ledger here, or leave kitchen mode.
  if ((await ownerPins(member.householdId)).length === 0) {
    return "An owner needs to set a kitchen PIN first (on their own phone or computer).";
  }
  const jar = await cookies();
  jar.set(KITCHEN_COOKIE, "1", cookie(400 * 24 * 60 * 60));
  jar.delete(UNLOCK_COOKIE);
  redirect("/");
}

export async function unlock(next: string, _: Result, form: FormData): Promise<Result> {
  const member = await currentMember();
  const pin = String(form.get("pin") ?? "");
  if (!isPin(pin)) return "PINs are 4 to 8 digits.";

  const admin = createAdminClient();
  const { data: home, error } = await admin
    .from("households")
    .select("kitchen_failed_pins, kitchen_locked_until")
    .eq("id", member.householdId)
    .single();
  if (error) throw error;
  const pausedFor = home.kitchen_locked_until ? Date.parse(home.kitchen_locked_until) - Date.now() : 0;
  if (pausedFor > 0) {
    return `Too many wrong PINs. Try again in ${Math.ceil(pausedFor / 60_000)} minute${pausedFor > 60_000 ? "s" : ""}.`;
  }

  const match = (await ownerPins(member.householdId)).find((p) => pinMatches(pin, p.pin_hash));
  if (!match) {
    // ponytail: read-then-write, so two guesses at the same instant could
    // both count as one. Fine for one kitchen screen.
    const wrong = afterWrongPin(home.kitchen_failed_pins);
    await admin
      .from("households")
      .update({ kitchen_failed_pins: wrong.failed, kitchen_locked_until: wrong.lockedUntil?.toISOString() ?? null })
      .eq("id", member.householdId);
    const left = MAX_WRONG_PINS - wrong.failed;
    return wrong.lockedUntil ? "Too many wrong PINs. Try again in 5 minutes." : `Wrong PIN. ${left} tr${left === 1 ? "y" : "ies"} left.`;
  }

  await admin
    .from("households")
    .update({ kitchen_failed_pins: 0, kitchen_locked_until: null })
    .eq("id", member.householdId);
  const jar = await cookies();
  if (form.get("leave") === "on") {
    jar.delete(KITCHEN_COOKIE);
    jar.delete(UNLOCK_COOKIE);
    redirect("/");
  }
  const exp = Date.now() + UNLOCK_MINUTES * 60_000;
  jar.set(
    UNLOCK_COOKIE,
    signUnlock({ u: member.id, h: member.householdId, o: match.profile_id, exp }, unlockKey()),
    cookie(UNLOCK_MINUTES * 60),
  );
  redirect(safe(next));
}

/** Lock the Ledger again (the Lock button, or no taps for a few minutes). */
export async function lock(): Promise<void> {
  (await cookies()).delete(UNLOCK_COOKIE);
  redirect("/");
}

/** An owner sets or changes their own PIN, from their own device. */
export async function setPin(_: Result, form: FormData): Promise<Result> {
  const member = await currentMember();
  if (member.role !== "owner") return "Only owners have a kitchen PIN.";
  if ((await kitchenState(member)).kitchen) {
    return "Set your PIN on your own phone or computer, not on the kitchen screen.";
  }
  const pin = String(form.get("pin") ?? "");
  if (!isPin(pin)) return "Use 4 to 8 digits.";
  if (pin !== String(form.get("confirm") ?? "")) return "The two PINs don't match.";
  const { error } = await createAdminClient()
    .from("kitchen_pins")
    .upsert({
      profile_id: member.id,
      household_id: member.householdId,
      pin_hash: hashPin(pin),
      updated_at: new Date().toISOString(),
    });
  if (error) {
    console.error(error);
    return "Couldn't save your PIN. Try again.";
  }
  revalidatePath("/helm");
  return null;
}
