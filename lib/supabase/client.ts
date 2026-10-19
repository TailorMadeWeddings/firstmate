import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      // One login across kiddfamily.net and its subdomains (unset in dev).
      cookieOptions: { domain: process.env.NEXT_PUBLIC_COOKIE_DOMAIN },
    },
  );
}
