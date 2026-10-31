// The morning price check, run by Vercel Cron (vercel.json), which signs its
// call with CRON_SECRET. Checks Coles, Woolworths, Aldi and Harris Farm for
// every ingredient any household follows. Costco comes from receipts instead.
import { NextResponse } from "next/server";
import { dayKey } from "@/lib/logbook";
import { pull } from "@/lib/prices";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Only Vercel Cron runs the price check." }, { status: 401 });
  }
  const db = createAdminClient();
  const { data: items, error } = await db.from("price_items").select("id, household_id, search").order("created_at");
  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Couldn't read what to check." }, { status: 500 });
  }
  const result = await pull(db, items, dayKey(new Date()));
  if (result.failed.length) console.error(`Price check: ${result.failed.join("; ")}`);
  return NextResponse.json({ ingredients: items.length, ...result });
}
