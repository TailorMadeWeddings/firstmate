import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function currentUserId(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims.sub;
  if (!id) redirect("/auth/login");
  return id;
}
