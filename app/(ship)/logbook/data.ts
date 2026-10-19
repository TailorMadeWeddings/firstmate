// Loading the Logbook: who's in the crew, and what's on between two dates.
// Reads go through the signed-in user's client, so row-level security
// decides what they see (crew only; Guests see nothing).
import { notFound } from "next/navigation";
import { CREW_COLOURS, type EventRow, type ExceptionRow, type Occurrence, occurrences } from "@/lib/logbook";
import { type Member, currentMember } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";

/** Owners and Trusted members. Guests get a 404, like the Ledger for non-owners. */
export async function currentCrew(): Promise<Member> {
  const member = await currentMember();
  if (member.role === "guest") notFound();
  return member;
}

export type CrewMember = {
  /** "p:<profile id>" or "d:<dependent id>" */
  key: string;
  kind: "profile" | "dependent";
  id: string;
  name: string;
  color: string;
  /** Captain, Officer or Visitor for people; age for children. */
  label: string;
};

const ROLE_LABEL = { owner: "Captain", trusted: "Officer", guest: "Visitor" } as const;

// Without generated database types the client guesses shapes (e.g. a joined
// profile as a list), so callers say what the rows really are.
const must = <T,>({ data, error }: { data: unknown; error: unknown }): T => {
  if (error) throw error;
  return data as T;
};

export async function loadCrew(householdId: string): Promise<CrewMember[]> {
  const supabase = await createClient();
  const [members, kids] = await Promise.all([
    supabase
      .from("household_members")
      .select("profile_id, role, profiles(display_name, color)")
      .eq("household_id", householdId)
      .order("joined_at"),
    supabase
      .from("dependents")
      .select("id, display_name, color, date_of_birth")
      .eq("household_id", householdId)
      .order("date_of_birth"),
  ]);
  type MemberRow = { profile_id: string; role: keyof typeof ROLE_LABEL; profiles: { display_name: string; color: string | null } | null };
  type KidRow = { id: string; display_name: string; color: string | null; date_of_birth: string | null };
  const people = must<MemberRow[]>(members).map((m) => ({
    key: `p:${m.profile_id}`,
    kind: "profile" as const,
    id: m.profile_id,
    name: m.profiles?.display_name ?? "Crew",
    stored: m.profiles?.color ?? null,
    label: ROLE_LABEL[m.role],
  }));
  const children = must<KidRow[]>(kids).map((k) => ({
    key: `d:${k.id}`,
    kind: "dependent" as const,
    id: k.id,
    name: k.display_name,
    stored: k.color,
    label: k.date_of_birth ? `Midshipman · ${age(k.date_of_birth)}` : "Midshipman",
  }));
  // Anyone without a colour of their own gets the next default, in order.
  return [...people, ...children].map(({ stored, ...c }, i) => ({ ...c, color: stored ?? CREW_COLOURS[i % CREW_COLOURS.length] }));
}

function age(born: string) {
  const years = Math.floor((Date.now() - Date.parse(born)) / (365.25 * 86_400_000));
  return years < 1 ? "baby" : `${years}`;
}

export type Entry = Occurrence & { assignees: string[]; createdBy: string };

/** Every occurrence overlapping [from, to), with who it's for. */
export async function loadEntries(from: Date, to: Date): Promise<Entry[]> {
  const supabase = await createClient();
  const events = must<(EventRow & { created_by: string })[]>(
    await supabase
      .from("events")
      .select("id, title, description, location, start_at, end_at, all_day, recurrence_rule, recurrence_ends_at, created_by")
      .lt("start_at", to.toISOString())
      .or(`recurrence_rule.not.is.null,end_at.gt.${from.toISOString()}`)
      .or(`recurrence_ends_at.is.null,recurrence_ends_at.gt.${from.toISOString()}`),
  );
  if (events.length === 0) return [];
  const ids = events.map((e) => e.id);
  const [exceptions, assignees] = await Promise.all([
    supabase
      .from("event_exceptions")
      .select("parent_event_id, original_start_at, is_cancelled, title, description, location, start_at, end_at")
      .in("parent_event_id", ids),
    supabase.from("event_assignees").select("event_id, profile_id, dependent_id").in("event_id", ids),
  ]);
  const who = new Map<string, string[]>();
  for (const a of must<{ event_id: string; profile_id: string | null; dependent_id: string | null }[]>(assignees)) {
    const key = a.profile_id ? `p:${a.profile_id}` : `d:${a.dependent_id}`;
    who.set(a.event_id, [...(who.get(a.event_id) ?? []), key]);
  }
  const creator = new Map(events.map((e) => [e.id, e.created_by]));
  return occurrences(events, must<ExceptionRow[]>(exceptions), from, to).map((o) => ({
    ...o,
    assignees: who.get(o.eventId) ?? [],
    createdBy: creator.get(o.eventId) ?? "",
  }));
}
