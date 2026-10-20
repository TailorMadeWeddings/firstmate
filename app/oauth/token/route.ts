// Swaps a one-time code (with its PKCE verifier) for the token the app keeps.
import { hashKey } from "@/lib/health";
import { newSecret, pkceMatches } from "@/lib/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

const reply = (status: number, body: object) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const bad = (error: string, error_description: string) => reply(400, { error, error_description });

export async function POST(request: Request) {
  const form = new URLSearchParams(await request.text());
  if (form.get("grant_type") !== "authorization_code") return bad("unsupported_grant_type", "Only authorization_code.");
  const code = form.get("code") ?? "";
  const verifier = form.get("code_verifier") ?? "";
  if (!code || !verifier) return bad("invalid_request", "Send code and code_verifier.");

  // Claiming the code and setting the token in one update makes the code
  // single-use: a second try finds nothing.
  const db = createAdminClient();
  const token = newSecret();
  const { data: row, error } = await db
    .from("mcp_tokens")
    .update({ code_hash: null, token_hash: hashKey(token) })
    .eq("code_hash", hashKey(code))
    .gt("code_expires_at", new Date().toISOString())
    .select("id, code_challenge, redirect_uri")
    .maybeSingle();
  if (error) {
    console.error(error);
    return reply(500, { error: "server_error" });
  }
  if (!row) return bad("invalid_grant", "That code is wrong, used or out of date.");
  const redirectUri = form.get("redirect_uri");
  if (!pkceMatches(verifier, row.code_challenge) || (redirectUri !== null && redirectUri !== row.redirect_uri)) {
    await db.from("mcp_tokens").delete().eq("id", row.id);
    return bad("invalid_grant", "The code_verifier or redirect_uri doesn't match.");
  }
  return reply(200, { access_token: token, token_type: "Bearer" });
}
