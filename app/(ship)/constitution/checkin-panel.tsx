"use client";

import { MessageSquareText, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { blocks, boldParts } from "@/lib/constitution";
import { deleteCheckin } from "./actions";
import type { Checkin } from "./data";

/** Paragraphs, "- " lists and **bold**: everything a check-in uses. */
function CheckinText({ text }: { text: string }) {
  const line = (t: string) => boldParts(t).map((p, i) => (p.bold ? <strong key={i}>{p.text}</strong> : <span key={i}>{p.text}</span>));
  return (
    <div className="flex flex-col gap-3 text-[15px] leading-relaxed">
      {blocks(text).map((b, i) =>
        b.kind === "p" ? (
          <p key={i}>{line(b.text)}</p>
        ) : (
          <ul key={i} className="flex list-disc flex-col gap-1 pl-5">
            {b.items.map((item, j) => (
              <li key={j}>{line(item)}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

const when = (at: string) =>
  new Date(at).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" });

/**
 * The weekly check-in: streams in as Claude writes it, then it's saved and
 * kept with the earlier ones. Starts by itself straight after a new entry.
 */
export function CheckinPanel({ checkins, autoStart, ready }: { checkins: Checkin[]; autoStart: boolean; ready: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const started = useRef(false);

  const run = async () => {
    setBusy(true);
    setProblem(null);
    setText("");
    try {
      const res = await fetch("/constitution/checkin", { method: "POST" });
      if (!res.ok || !res.body) {
        setProblem((await res.text()) || "Couldn't get a check-in. Try again.");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setText((t) => t + decoder.decode(value, { stream: true }));
      }
      router.refresh();
    } catch {
      setProblem("Couldn't reach the check-in. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!autoStart || started.current || !ready) return;
    started.current = true;
    router.replace("/constitution", { scroll: false });
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, ready]);

  // Once saved, the new check-in comes back as the latest; until then, show what's streamed.
  const streaming = busy || (text !== "" && checkins[0]?.content !== text.trim());
  const [latest, ...older] = checkins;

  return (
    <section aria-labelledby="checkin" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="checkin" className="flex items-center gap-2 font-serif text-2xl font-black">
          <MessageSquareText className="size-5" aria-hidden /> Weekly check-in
        </h2>
        <Button onClick={run} disabled={busy || !ready} variant={latest ? "secondary" : "default"}>
          {busy ? "Writing…" : "Get this week's check-in"}
        </Button>
      </div>
      {problem && (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {problem}
        </p>
      )}
      {streaming ? (
        <article aria-live="polite" aria-busy={busy} className="rounded-2xl border bg-card p-5 shadow-sm">
          {text ? <CheckinText text={text} /> : <p className="text-muted-foreground">Reading your weeks…</p>}
        </article>
      ) : latest ? (
        <article className="rounded-2xl border bg-card p-5 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{when(latest.created_at)}</p>
          <CheckinText text={latest.content} />
        </article>
      ) : (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {ready ? "No check-ins yet. Get one for this week." : "Add this week's numbers, and a check-in follows."}
        </p>
      )}
      {older.length > 0 && (
        <details className="rounded-2xl border bg-card">
          <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-muted-foreground">Earlier check-ins ({older.length})</summary>
          <ul className="divide-y border-t">
            {older.map((c) => (
              <li key={c.id}>
                <details className="group px-5 py-3">
                  <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                    <span className="font-medium">{when(c.created_at)}</span>
                    <span className="truncate text-muted-foreground">{c.content.replace(/\*\*/g, "").slice(0, 80)}…</span>
                  </summary>
                  <div className="mt-3 flex flex-col gap-3">
                    <CheckinText text={c.content} />
                    <ActionForm action={deleteCheckin.bind(null, c.id)} confirm="Delete this check-in?" className="self-end">
                      <Button size="sm" variant="ghost" className="text-muted-foreground">
                        <Trash2 aria-hidden /> Delete
                      </Button>
                    </ActionForm>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
