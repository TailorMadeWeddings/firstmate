import { createClient } from "@supabase/supabase-js";

/** Skips row-level security. Server code only: the secret key must never reach a browser. */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
