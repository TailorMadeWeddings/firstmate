import { cookies } from "next/headers";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { type Unlock, readUnlock } from "@/lib/kitchen";
import { createClient } from "@/lib/supabase/server";

export type Member = {
  id: string;
  householdId: string;
  role: "owner" | "trusted" | "guest";
};

/**
 * The signed-in household member. Anyone not in a household is turned away.
 * Asked for by the menu, the page and every card on it, so it's looked up
 * once per request and shared (React's cache lasts for one request only).
 */
export const currentMember = cache(async (): Promise<Member> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims.sub;
  if (!id) redirect("/auth/login");
  // ponytail: first household only; v1 has just the one.
  // Row-level security only shows membership rows from your own households.
  const { data: member } = await supabase
    .from("household_members")
    .select("household_id, role")
    .eq("profile_id", id)
    .limit(1)
    .maybeSingle();
  if (!member) redirect("/auth/error?error=This account isn't part of the family yet.");
  return { id, householdId: member.household_id, role: member.role };
});

// ---------- the kitchen screen (The Helm) ----------
// Both cookies are httpOnly and set only by server actions, so page scripts
// can't fake them; the unlock is also signed and expires on its own.

export const KITCHEN_COOKIE = "fm_kitchen";
export const UNLOCK_COOKIE = "fm_unlock";

/** Signs unlock cookies. Server-only, like the key itself. */
export function unlockKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");
  return key;
}

/** Whether this device is the kitchen screen, and who unlocked it (if anyone, still in time). */
export async function kitchenState(member: Member): Promise<{ kitchen: boolean; unlock: Unlock | null }> {
  const jar = await cookies();
  const kitchen = jar.get(KITCHEN_COOKIE)?.value === "1";
  const unlock = kitchen
    ? readUnlock(jar.get(UNLOCK_COOKIE)?.value, unlockKey(), { u: member.id, h: member.householdId })
    : null;
  return { kitchen, unlock };
}

/** The Ledger is for owners, and on the kitchen screen only while a PIN has unlocked it. */
export async function canSeeLedger(member: Member): Promise<boolean> {
  if (member.role !== "owner") return false;
  const { kitchen, unlock } = await kitchenState(member);
  return !kitchen || unlock !== null;
}

/**
 * Owners only: anyone else gets a 404, so they don't learn the page exists.
 * On a locked kitchen screen even owners are sent to the PIN prompt first.
 */
export async function currentOwner(): Promise<Member> {
  const member = await currentMember();
  if (member.role !== "owner") notFound();
  if (!(await canSeeLedger(member))) redirect("/unlock?next=/ledger");
  return member;
}

/**
 * Constitution is personal: the crew (Captains for fitness and the family's
 * medical records, Officers for their own), and never on the kitchen screen,
 * which anyone in the house can walk up to.
 */
export async function canSeeConstitution(member: Member): Promise<boolean> {
  return member.role !== "guest" && !(await kitchenState(member)).kitchen;
}

/** Someone in the crew, on their own device: medical records. Anyone else gets a 404. */
export async function currentMedicalMember(): Promise<Member> {
  const member = await currentMember();
  if (!(await canSeeConstitution(member))) notFound();
  return member;
}

/** A Captain, on their own device: fitness tracking. Officers go to their medical records instead. */
export async function currentHealthOwner(): Promise<Member> {
  const member = await currentMedicalMember();
  if (member.role !== "owner") redirect("/constitution/exercise");
  return member;
}

/**
 * Voyage is personal too: the crew, on their own device. Captains keep the
 * books; Officers tell stories (row-level security shows them only theirs).
 */
export const currentVoyageMember = currentMedicalMember;

/** A Captain, on their own device: the books themselves. Officers go to their stories. */
export async function currentVoyageCaptain(): Promise<Member> {
  const member = await currentVoyageMember();
  if (member.role !== "owner") redirect("/voyage/stories");
  return member;
}

/** Owners and Trusted members (the crew). Guests get a 404, as with the Ledger for non-owners. */
export async function currentCrew(): Promise<Member> {
  const member = await currentMember();
  if (member.role === "guest") notFound();
  return member;
}

export async function currentUserId(): Promise<string> {
  return (await currentMember()).id;
}
