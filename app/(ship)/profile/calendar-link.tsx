"use client";

import { Check, Copy } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { dropCalendarLink, makeCalendarLink } from "./actions";

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** Making and turning off the Logbook's private link for a phone's calendar. A new link is shown once, like the Health key. */
export function CalendarLink({ linked, base }: { linked: { created_at: string; last_used_at: string | null } | null; base: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const make = () => {
    if (linked && !window.confirm("Make a new link? The old one stops working, so calendars using it will need the new one.")) return;
    startTransition(async () => {
      const made = await makeCalendarLink();
      if ("error" in made) setError(made.error);
      else {
        setUrl(`${base}/api/calendar/${made.key}.ics`);
        setError(null);
        setCopied(false);
      }
    });
  };
  const drop = () => {
    if (!window.confirm("Turn the link off? Calendars subscribed to it stop updating.")) return;
    startTransition(async () => {
      setError(await dropCalendarLink());
      setUrl(null);
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-muted-foreground">
          {linked
            ? `Link made ${when(linked.created_at)}. ${linked.last_used_at ? `Last read ${when(linked.last_used_at)}.` : "Not read yet."}`
            : "Make a private link, then subscribe to it from Google Calendar or your iPhone."}
        </p>
        <Button size="sm" variant="secondary" onClick={make} disabled={pending}>
          {linked ? "New link" : "Make a link"}
        </Button>
        {linked && (
          <Button size="sm" variant="ghost" onClick={drop} disabled={pending}>
            Turn off
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {url && (
        <div className="flex flex-col gap-2 rounded-xl bg-muted/60 p-3">
          <p className="text-sm font-medium">Your link. Add it to your calendar now: it won’t be shown again. Anyone with it can read the Logbook.</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md bg-background px-2 py-1.5 text-xs">{url}</code>
            <Button size="sm" variant="secondary" aria-label="Copy the link" onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true))}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            </Button>
          </div>
          <a href={url.replace(/^https?:/, "webcal:")} className="self-start text-sm font-semibold text-primary hover:underline dark:text-blue-400">
            Add to Apple Calendar
          </a>
        </div>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">How to subscribe</summary>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5">
          <li>
            <b>iPhone or Mac:</b> tap <b>Add to Apple Calendar</b> above. (Or Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar, and paste the link.)
          </li>
          <li>
            <b>Google Calendar:</b> on a computer, next to <b>Other calendars</b> click <b>+</b> → <b>From URL</b>, and paste the link.
          </li>
          <li>
            <b>Outlook:</b> <b>Add calendar</b> → <b>Subscribe from web</b>, and paste the link.
          </li>
        </ul>
        <p className="mt-3 text-muted-foreground">
          It’s read-only: changes are made here, in the Logbook. Calendar apps check for changes every few hours (Google can take up to a day). It covers
          the last three months and the year ahead.
        </p>
      </details>
    </div>
  );
}
