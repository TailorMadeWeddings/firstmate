"use server";

// The answer to a sign-in request goes back to the app's redirect URI: a
// one-time code (good for five minutes) if allowed, or access_denied.
import { redirect } from "next/navigation";
import { hashKey } from "@/lib/health";
import { newSecret, readAuthorize, withParams } from "@/lib/oauth";
import { currentMedicalMember } from "@/lib/players";
import { createAdminClient } from "@/lib/supabase/admin";

/** The request again: what reaches a server action can't be trusted, even if the page checked it. */
function checked(query: string) {
  const request = readAuthorize(new URLSearchParams(query));
  if (typeof request === "string") throw new Error(request);
  return request;
}

export async function allow(query: string) {
  const member = await currentMedicalMember();
  const request = checked(query);
  const code = newSecret();
  const db = createAdminClient();
  // Approvals whose code was never swapped for a token.
  await db.from("mcp_tokens").delete().is("token_hash", null).lt("code_expires_at", new Date().toISOString());
  const { error } = await db.from("mcp_tokens").insert({
    profile_id: member.id,
    household_id: member.householdId,
    client: request.client,
    code_hash: hashKey(code),
    code_challenge: request.code_challenge,
    redirect_uri: request.redirect_uri,
    code_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  });
  if (error) throw error;
  redirect(withParams(request.redirect_uri, { code, state: request.state }));
}

export async function deny(query: string) {
  await currentMedicalMember();
  const request = checked(query);
  redirect(withParams(request.redirect_uri, { error: "access_denied", state: request.state }));
}
