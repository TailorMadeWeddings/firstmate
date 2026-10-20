"use client";

import { Check, Copy } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { dropHealthKey, makeHealthKey } from "./actions";
import type { HealthKey } from "./data";

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** Making and revoking the Shortcut's key, and how to build the Shortcut. A new key is shown once. */
export function HealthLink({ linked, url }: { linked: HealthKey | null; url: string }) {
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const make = () => {
    if (linked && !window.confirm("Make a new key? The old one stops working, so the Shortcut will need the new one.")) return;
    startTransition(async () => {
      const made = await makeHealthKey();
      if ("error" in made) setError(made.error);
      else {
        setKey(made.key);
        setError(null);
        setCopied(false);
      }
    });
  };
  const drop = () => {
    if (!window.confirm("Disconnect Apple Health? The Shortcut stops working; what it's sent stays.")) return;
    startTransition(async () => {
      setError(await dropHealthKey());
      setKey(null);
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-muted-foreground">
          {linked
            ? `Connected ${when(linked.created_at)}. ${linked.last_used_at ? `Last sent ${when(linked.last_used_at)}.` : "Nothing sent yet."}`
            : "Your iPhone sends Apple Health’s numbers here with a Shortcut. Start by making a key for it."}
        </p>
        <Button size="sm" variant="secondary" onClick={make} disabled={pending}>
          {linked ? "New key" : "Make a key"}
        </Button>
        {linked && (
          <Button size="sm" variant="ghost" onClick={drop} disabled={pending}>
            Disconnect
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {key && (
        <div className="flex flex-col gap-2 rounded-xl bg-muted/60 p-3">
          <p className="text-sm font-medium">Your key. Copy it into the Shortcut now: it won’t be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md bg-background px-2 py-1.5 text-xs">{key}</code>
            <Button
              size="sm"
              variant="secondary"
              aria-label="Copy the key"
              onClick={() => navigator.clipboard.writeText(key).then(() => setCopied(true))}
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            </Button>
          </div>
        </div>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">How to set up the Shortcut</summary>
        <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5">
          <li>Make a key above and copy it.</li>
          <li>
            On your iPhone, open <b>Shortcuts</b>, tap <b>+</b> and name the shortcut <b>First Mate Health</b>.
          </li>
          <li>
            Add <b>Find Health Samples</b> where <b>Type</b> is <b>Steps</b> and <b>Start Date</b> is <b>Today</b>, then <b>Calculate Statistics</b> →{" "}
            <b>Sum</b>. Do the same for <b>Active Energy</b> (Sum), <b>Exercise Minutes</b> (Sum), <b>Heart Rate</b> (Average) and{" "}
            <b>Resting Heart Rate</b> (Average). Skip any you don’t track.
          </li>
          <li>
            Add <b>Get Contents of URL</b> with the URL <code className="break-all rounded bg-muted px-1">{url}</code>. Tap <b>Show More</b>: set{" "}
            <b>Method</b> to <b>POST</b>; add a <b>Header</b> called <code className="rounded bg-muted px-1">Authorization</code> with the value{" "}
            <code className="rounded bg-muted px-1">Bearer</code>, a space, and your key; set <b>Request Body</b> to <b>JSON</b> and add <b>Number</b> fields{" "}
            <code className="rounded bg-muted px-1">steps</code>, <code className="rounded bg-muted px-1">active_kcal</code>,{" "}
            <code className="rounded bg-muted px-1">exercise_minutes</code>, <code className="rounded bg-muted px-1">avg_hr</code> and{" "}
            <code className="rounded bg-muted px-1">resting_hr</code>, each set to its Calculate Statistics result. (If Health shows energy in kilojoules,
            call that field <code className="rounded bg-muted px-1">active_kj</code>.)
          </li>
          <li>Run it once and allow access to Health. Today’s numbers show up here.</li>
          <li>
            To send them every day: in Shortcuts, open <b>Automation</b>, tap <b>+</b>, choose <b>Time of Day</b>, pick <b>9:00 pm</b> and{" "}
            <b>Daily</b>, choose <b>Run Immediately</b>, then pick <b>First Mate Health</b>.
          </li>
        </ol>
        <p className="mt-3 text-muted-foreground">
          Each run replaces that day’s numbers, so run it as often as you like. Health can’t be read while the phone is locked, so if the
          automation finds it locked, tap the shortcut later to send the day’s numbers. To send another day, add a <code className="rounded bg-muted px-1">day</code> field like 2026-10-20.
        </p>
      </details>
    </div>
  );
}
