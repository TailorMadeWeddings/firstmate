import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  // games.kiddfamily.net (games.localhost in dev) serves app/games, family
  // only. The shared login pages under /auth stay where they are.
  const { pathname } = request.nextUrl;
  if (request.headers.get("host")?.startsWith("games.") && !pathname.startsWith("/auth")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/games" : `/games${pathname}`;
    return await updateSession(request, url);
  }
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
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
