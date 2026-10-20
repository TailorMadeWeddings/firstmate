import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { pkceMatches, readAuthorize, redirectAllowed, withParams } from "./oauth.ts";

test("codes only go to Claude or this computer", () => {
  assert.ok(redirectAllowed("https://claude.ai/api/mcp/auth_callback"));
  assert.ok(redirectAllowed("https://claude.com/api/mcp/auth_callback"));
  assert.ok(redirectAllowed("http://localhost:33418/callback"));
  assert.ok(redirectAllowed("http://127.0.0.1:5000/cb"));
  assert.ok(!redirectAllowed("https://evil.com/api/mcp/auth_callback"));
  assert.ok(!redirectAllowed("https://claude.ai@evil.com/api/mcp/auth_callback"));
  assert.ok(!redirectAllowed("https://claude.ai/somewhere-else"));
  assert.ok(!redirectAllowed("http://claude.ai/api/mcp/auth_callback"));
  assert.ok(!redirectAllowed("http://localhost.evil.com/cb"));
  assert.ok(!redirectAllowed("not a url"));
});

test("PKCE: the verifier must hash to the challenge", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  assert.equal(challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"); // RFC 7636's example
  assert.ok(pkceMatches(verifier, challenge));
  assert.ok(!pkceMatches("something else", challenge));
});

test("reads a sign-in request", () => {
  const good = new URLSearchParams({
    response_type: "code",
    client_id: "x",
    redirect_uri: "https://claude.ai/api/mcp/auth_callback",
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    code_challenge_method: "S256",
    state: "abc",
  });
  assert.deepEqual(readAuthorize(good), {
    redirect_uri: "https://claude.ai/api/mcp/auth_callback",
    state: "abc",
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    client: "claude.ai",
  });
  const without = (k: string) => {
    const p = new URLSearchParams(good);
    p.delete(k);
    return readAuthorize(p);
  };
  assert.equal(typeof without("redirect_uri"), "string");
  assert.equal(typeof without("code_challenge"), "string");
  assert.equal(typeof without("code_challenge_method"), "string");
  assert.equal(typeof without("response_type"), "string");
  assert.equal((without("state") as { state: string | null }).state, null);
});

test("adds the answer to the redirect", () => {
  assert.equal(withParams("http://localhost:1/cb?x=1", { code: "c", state: null }), "http://localhost:1/cb?x=1&code=c");
});
