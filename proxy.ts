import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * - api/health, api/mcp, api/calendar (the iPhone Shortcut, Claude and calendar apps sign in with a key, not a session)
     * - .well-known, oauth/register, oauth/token (how apps find and finish signing in)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/health|api/mcp|api/calendar|\\.well-known|oauth/register|oauth/token|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
