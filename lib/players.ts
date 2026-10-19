import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Member = {
  id: string;
  householdId: string;
  role: "owner" | "trusted" | "guest";
};

/** The signed-in household member. Anyone not in a household is turned away. */
export async function currentMember(): Promise<Member> {
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
}

export async function currentUserId(): Promise<string> {
  return (await currentMember()).id;
}
