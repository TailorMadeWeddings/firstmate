import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** The signed-in user's id. Anyone not in a household is turned away. */
export async function currentUserId(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims.sub;
  if (!id) redirect("/auth/login");
  // Row-level security only shows membership rows from your own households.
  const { data: member } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("profile_id", id)
    .limit(1)
    .maybeSingle();
  if (!member) redirect("/auth/error?error=This account isn't part of the family yet.");
  return id;
}
