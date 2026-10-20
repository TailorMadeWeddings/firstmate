// Signing Claude in to First Mate's MCP server with OAuth: just what MCP
// clients use (metadata, dynamic registration, authorization codes with
// PKCE). The person approves on First Mate, signed in as themselves, and the
// client gets a token that acts as them. Pure, so it's testable.
import { createHash, randomBytes } from "node:crypto";

/** Where codes may go: Claude's own callback, or a program on this computer (Claude Code). */
export function redirectAllowed(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.protocol === "https:") return (u.hostname === "claude.ai" || u.hostname === "claude.com") && u.pathname === "/api/mcp/auth_callback";
  return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
}

export const pkceMatches = (verifier: string, challenge: string) => createHash("sha256").update(verifier).digest("base64url") === challenge;

/** A random token or code. Kept only as its hash (hashKey in lib/health). */
export const newSecret = () => `fm_${randomBytes(32).toString("base64url")}`;

export type Authorize = { redirect_uri: string; state: string | null; code_challenge: string; client: string };

/** A client's sign-in request, checked; or what's wrong with it. */
export function readAuthorize(p: URLSearchParams): Authorize | string {
  const redirect_uri = p.get("redirect_uri") ?? "";
  const code_challenge = p.get("code_challenge") ?? "";
  if (!redirectAllowed(redirect_uri)) return "That app isn't one First Mate lets in.";
  if (p.get("response_type") !== "code") return "The app asked in a way First Mate doesn't understand (response_type).";
  if (p.get("code_challenge_method") !== "S256" || !/^[\w-]{43}$/.test(code_challenge)) return "The app didn't send a PKCE challenge.";
  return { redirect_uri, state: p.get("state"), code_challenge, client: new URL(redirect_uri).hostname };
}

/** The redirect URI with the answer added. */
export function withParams(uri: string, params: Record<string, string | null>): string {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== null) u.searchParams.set(k, v);
  return u.toString();
}
