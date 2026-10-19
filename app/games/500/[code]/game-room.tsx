"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { type RoomView } from "@/lib/games/500/room";
import { createClient } from "@/lib/supabase/client";
import { advance, act, getRoom, sitAt, startGame } from "../actions";
import { Table } from "../table";

export function GameRoom({ initial }: { initial: RoomView }) {
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState(false);
  const { code } = initial;

  // Replies can arrive out of order; keep the newest. A copy of what's already
  // showing is dropped too, or it would restart the computer players' pause.
  const latest = useRef(initial.version);
  const show = useCallback((next: RoomView | null) => {
    if (next && next.version > latest.current) {
      latest.current = next.version;
      setView(next);
    }
  }, []);

  const run = useCallback(
    async (call: () => Promise<RoomView | null>) => {
      setBusy(true);
      try {
        show(await call());
      } catch {
        // Usually someone else moved first: catch up and let them try again.
        show(await getRoom(code).catch(() => null));
      } finally {
        setBusy(false);
      }
    },
    [code, show],
  );

  // Refresh when anyone else moves (our own moves are already showing), and
  // when a phone wakes up.
  useEffect(() => {
    const supabase = createClient();
    const refresh = () => getRoom(code).then(show, () => {});
    const channel = supabase
      .channel(`game-500:${code}`)
      .on("broadcast", { event: "update" }, ({ payload }) => {
        if (payload?.version > latest.current) refresh();
      })
      .subscribe();
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [code, show]);

  // Computer players move after a pause, a longer one so people can see a finished trick.
  useEffect(() => {
    const g = view.game;
    if (
      view.status !== "playing" ||
      !g ||
      !["bidding", "kitty", "playing"].includes(g.phase) ||
      view.players[g.turn] !== null
    ) {
      return;
    }
    const finishedTrick = g.phase === "playing" && !g.trick.length && g.lastTrick;
    const t = setTimeout(
      () => run(() => advance(code, view.version)),
      finishedTrick ? 1500 : 500,
    );
    return () => clearTimeout(t);
  }, [view, code, run]);

  if (view.status === "waiting") return <WaitingRoom view={view} run={run} busy={busy} />;
  return <Table view={view} busy={busy} act={(action) => run(() => act(code, action))} />;
}

function WaitingRoom({
  view,
  run,
  busy,
}: {
  view: RoomView;
  run: (call: () => Promise<RoomView | null>) => void;
  busy: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const empty = view.players.filter((p) => p === null).length;

  const seat = (s: number) =>
    s === view.seat ? (
      <div className="rounded-md bg-amber-300 px-3 py-2 font-semibold text-amber-950">You</div>
    ) : view.players[s] ? (
      <div className="rounded-md bg-emerald-50/15 px-3 py-2 font-semibold">{view.players[s]}</div>
    ) : (
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => run(() => sitAt(view.code, s))}
      >
        Sit here
      </Button>
    );

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-5 px-4 py-6">
      <header className="flex items-baseline gap-3">
        <Link href="/games/500" className="text-sm text-muted-foreground hover:underline">
          ← 500
        </Link>
        <h1 className="text-2xl font-bold">Game {view.code}</h1>
      </header>

      <div className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
        <p>Send this game&apos;s link to the family, or give them the code {view.code}.</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            navigator.clipboard.writeText(location.href).then(() => setCopied(true))
          }
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        {[
          [0, 2],
          [1, 3],
        ].map(([a, b], team) => (
          <div
            key={team}
            className="flex flex-col gap-2 rounded-2xl bg-emerald-800 p-4 text-emerald-50"
          >
            <h2 className="text-sm opacity-75">Partners</h2>
            {seat(a)}
            {seat(b)}
          </div>
        ))}
      </section>

      {view.isHost ? (
        <Button size="lg" disabled={busy} onClick={() => run(() => startGame(view.code))}>
          Start game
          {empty > 0 && ` (${empty} computer player${empty === 1 ? "" : "s"})`}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          {view.seat >= 0 ? "You're in. " : "Pick a seat. "}The host starts the game; empty seats
          are played by the computer.
        </p>
      )}
    </main>
  );
}
