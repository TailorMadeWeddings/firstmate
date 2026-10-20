// Dynamic client registration (RFC 7591), which Claude does before signing in.
// ponytail: client ids aren't kept or checked; the redirect URI allowlist and
// the person's approval are what let an app in. Keep clients if that changes.
import { randomUUID } from "node:crypto";
import { redirectAllowed } from "@/lib/oauth";

export async function POST(request: Request) {
  let body: { redirect_uris?: unknown; client_name?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_client_metadata", error_description: "The body should be JSON." }, { status: 400 });
  }
  const uris = body.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || !uris.every((u) => typeof u === "string" && redirectAllowed(u))) {
    return Response.json({ error: "invalid_redirect_uri", error_description: "First Mate only signs in Claude and apps on this computer." }, { status: 400 });
  }
  return Response.json(
    {
      client_id: randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: typeof body.client_name === "string" ? body.client_name : undefined,
      redirect_uris: uris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201 },
  );
}
