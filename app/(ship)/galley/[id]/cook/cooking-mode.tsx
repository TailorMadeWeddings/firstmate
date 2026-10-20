"use client";

import { ChevronLeft, ChevronRight, Pause, Play, Timer as TimerIcon, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Ingredient,
  type Step,
  type Timer,
  clock,
  finished,
  formatQuantity,
  pauseTimer,
  remaining,
  resumeTimer,
  startTimer,
  unitFor,
} from "@/lib/galley";
import { useStayAwake } from "@/components/stay-awake";
import { markCooked } from "../../actions";

type Props = { id: string; title: string; ingredients: Ingredient[]; steps: Step[] };

// ---------- sound ----------

let audio: AudioContext | null = null;

/** Phones only allow sound after a tap, so starting a timer (a tap) wakes the audio. */
function wakeAudio() {
  audio ??= new AudioContext();
  void audio.resume();
}

/** A soft two-note chime, three times: noticeable across a kitchen, not jarring. */
function chime() {
  if (!audio) return;
  for (let round = 0; round < 3; round++) {
    [523.25, 659.25].forEach((freq, i) => {
      const t = audio!.currentTime + round * 0.9 + i * 0.22;
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      osc.connect(gain).connect(audio!.destination);
      osc.start(t);
      osc.stop(t + 0.85);
    });
  }
}

// ---------- the screen ----------

/**
 * Cooking mode: full screen, very large text, ingredients first and then
 * one step at a time. Big Back and Next buttons (a knuckle will do), a
 * swipe, or the arrow keys move between steps. Steps that mention a time
 * offer a timer; several can run at once and chime when they're done.
 */
export function CookingMode({ id, title, ingredients, steps }: Props) {
  useStayAwake();
  // Page 0 is the ingredients; pages 1..n are the steps.
  const [page, setPage] = useState(ingredients.length ? 0 : 1);
  const [timers, setTimers] = useState<Timer[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const chimed = useRef(new Set<string>());
  const swipeFrom = useRef<number | null>(null);
  const last = steps.length;

  const go = useCallback((delta: number) => setPage((p) => Math.min(last, Math.max(ingredients.length ? 0 : 1, p + delta))), [last, ingredients.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Space on a focused button presses that button; don't also turn the page.
      if (e.target instanceof Element && e.target.closest("button, a")) return;
      if (e.key === "ArrowRight" || e.key === " ") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  // Tick while any timer is running; chime once when each finishes.
  const running = timers.some((t) => t.endsAt !== null);
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => {
      const at = Date.now();
      setNow(at);
      for (const t of timers) {
        if (t.endsAt !== null && finished(t, at) && !chimed.current.has(t.id)) {
          chimed.current.add(t.id);
          chime();
        }
      }
    }, 250);
    return () => clearInterval(tick);
  }, [running, timers]);

  const start = (n: number) => {
    wakeAudio();
    const step = steps[n - 1];
    const at = Date.now();
    setNow(at);
    chimed.current.delete(`step-${n}`);
    setTimers((ts) => [...ts.filter((t) => t.id !== `step-${n}`), startTimer(`step-${n}`, `Step ${n}`, step.duration_seconds!, at)]);
  };
  const toggle = (timerId: string) => {
    wakeAudio();
    const at = Date.now();
    setNow(at);
    setTimers((ts) => ts.map((t) => (t.id !== timerId ? t : t.endsAt === null ? resumeTimer(t, at) : pauseTimer(t, at))));
  };
  const stop = (timerId: string) => setTimers((ts) => ts.filter((t) => t.id !== timerId));

  const step = page > 0 ? steps[page - 1] : null;
  const hasTimer = (n: number) => timers.some((t) => t.id === `step-${n}`);
  const big = "flex h-20 flex-1 items-center justify-center gap-2 rounded-2xl text-2xl font-bold transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring";

  return (
    <div
      className="fixed inset-0 z-[60] flex select-none flex-col bg-background text-foreground"
      onPointerDown={(e) => (swipeFrom.current = e.clientX)}
      onPointerUp={(e) => {
        if (swipeFrom.current === null) return;
        const dx = e.clientX - swipeFrom.current;
        swipeFrom.current = null;
        if (Math.abs(dx) > 80) go(dx < 0 ? 1 : -1);
      }}
    >
      <header className="flex items-center gap-3 border-b px-4 py-3 md:px-8">
        <p className="min-w-0 flex-1 truncate font-serif text-xl font-black md:text-2xl">{title}</p>
        <Link href={`/galley/${id}`} className="flex items-center gap-1 rounded-full border px-4 py-2 text-lg font-semibold hover:bg-muted" aria-label="Leave cooking mode">
          <X className="size-5" aria-hidden /> Done
        </Link>
      </header>

      {timers.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b bg-muted/50 px-4 py-2 md:px-8" aria-label="Timers">
          {timers.map((t) => {
            const done = finished(t, now);
            return (
              <div
                key={t.id}
                role="timer"
                aria-live={done ? "assertive" : "off"}
                className={`flex items-center gap-2 rounded-2xl border px-3 py-1.5 ${done ? "animate-pulse border-amber-500 bg-amber-100 text-amber-950 dark:bg-amber-900/60 dark:text-amber-50" : "bg-card"}`}
              >
                <TimerIcon className="size-5" aria-hidden />
                <span className="text-sm text-muted-foreground">{t.label}</span>
                <span className="font-mono text-2xl font-bold tabular-nums">{done ? "Done!" : clock(remaining(t, now))}</span>
                {!done && (
                  <button type="button" onClick={() => toggle(t.id)} className="rounded-full p-2 hover:bg-muted" aria-label={t.endsAt === null ? "Resume timer" : "Pause timer"}>
                    {t.endsAt === null ? <Play className="size-5" aria-hidden /> : <Pause className="size-5" aria-hidden />}
                  </button>
                )}
                <button type="button" onClick={() => stop(t.id)} className="rounded-full p-2 hover:bg-muted" aria-label={done ? "Dismiss timer" : "Cancel timer"}>
                  <X className="size-5" aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <main className="flex flex-1 flex-col overflow-y-auto px-6 py-8 md:px-16" aria-live="polite">
        {step === null ? (
          <>
            <p className="mb-6 text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">You&apos;ll need</p>
            <ul className="flex flex-col gap-3 text-2xl md:text-3xl">
              {ingredients.map((i, n) => (
                <li key={n} className="flex gap-4">
                  <span className="w-28 shrink-0 text-right font-bold tabular-nums">
                    {i.quantity !== null && formatQuantity(i.quantity)} {unitFor(i.unit, i.quantity)}
                  </span>
                  <span>
                    {i.name}
                    {i.notes && <span className="text-muted-foreground">, {i.notes}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="mb-6 text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              Step {page} of {last}
            </p>
            <p className="max-w-5xl text-3xl font-medium leading-snug md:text-5xl md:leading-tight">{step.instruction}</p>
            {step.duration_seconds && !hasTimer(page) && (
              <button
                type="button"
                onClick={() => start(page)}
                className="mt-10 flex items-center gap-3 self-start rounded-2xl border-2 border-primary px-6 py-4 text-2xl font-bold text-primary hover:bg-primary/10 dark:text-blue-400"
              >
                <TimerIcon className="size-7" aria-hidden /> Start {clock(step.duration_seconds * 1000)} timer
              </button>
            )}
          </>
        )}
      </main>

      <footer className="flex flex-col gap-3 border-t px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 md:px-8">
        {/* Progress: one segment per page, the current one in the accent. */}
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: last + (ingredients.length ? 1 : 0) }, (_, i) => i + (ingredients.length ? 0 : 1)).map((p) => (
            <span key={p} className={`h-1.5 flex-1 rounded-full ${p <= page ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => go(-1)} disabled={page <= (ingredients.length ? 0 : 1)} className={`${big} border bg-card disabled:opacity-30`}>
            <ChevronLeft className="size-8" aria-hidden /> Back
          </button>
          {page < last ? (
            <button type="button" onClick={() => go(1)} className={`${big} bg-primary text-primary-foreground`}>
              {page === 0 ? "Start cooking" : "Next step"} <ChevronRight className="size-8" aria-hidden />
            </button>
          ) : (
            // Finishing notes it was cooked, for "recently cooked"; the X up top just leaves.
            <form action={markCooked.bind(null, id)} className="flex flex-1">
              <button className={`${big} bg-primary text-primary-foreground`}>Done</button>
            </form>
          )}
        </div>
      </footer>
    </div>
  );
}
