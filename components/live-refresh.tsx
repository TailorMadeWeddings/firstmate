"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Re-renders the page when any of `tables` change, so an event added on a
 * phone shows up on The Helm without a refresh. Row-level security applies to
 * the change feed, so only the household's own changes arrive. Also refreshes
 * every few minutes (the now-line moves) and when a sleeping screen wakes.
 */
export function LiveRefresh({ channel, tables }: { channel: string; tables: string[] }) {
  const router = useRouter();
  // A new array arrives with every refresh; key on the names so the feed stays put.
  const names = tables.join(",");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A save touches several rows at once; one refresh is enough.
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    };
    const supabase = createClient();
    const feed = supabase.channel(channel);
    for (const table of names.split(",")) {
      feed.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    }
    feed.subscribe();
    const tick = setInterval(refresh, 5 * 60_000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(feed);
    };
  }, [router, channel, names]);
  return null;
}
