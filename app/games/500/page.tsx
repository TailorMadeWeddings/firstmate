import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { currentUserId } from "@/lib/players";
import { createAdminClient } from "@/lib/supabase/admin";
import { createGame, joinGame } from "./actions";

export const metadata: Metadata = {
  title: "500 · Kidd Family Games",
};

export default function FiveHundred() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-4 py-6">
      <header className="flex items-baseline gap-3">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← Games
        </Link>
        <h1 className="text-2xl font-bold">500</h1>
      </header>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Lobby />
      </Suspense>
    </main>
  );
}

async function Lobby() {
  const me = await currentUserId();
  const { data: games } = await createAdminClient()
    .from("games_500")
    .select("code, status, created_at")
    .contains("seats", [me])
    .neq("status", "finished")
    .order("created_at", { ascending: false });

  return (
    <>
      <section className="flex flex-col gap-2">
        <form action={createGame}>
          <Button size="lg" className="w-full">
            New game
          </Button>
        </form>
        <p className="text-sm text-muted-foreground">
          Choose your seat and partner, then start. The computer plays any empty seats.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Join a game</h2>
        <form action={joinGame} className="flex gap-2">
          <Input
            name="code"
            aria-label="Game code"
            placeholder="Code, e.g. KQJT"
            maxLength={4}
            autoCapitalize="characters"
            className="uppercase"
          />
          <Button variant="outline">Join</Button>
        </form>
      </section>

      {!!games?.length && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Your games</h2>
          <ul className="divide-y rounded-xl border">
            {games.map((g) => (
              <li key={g.code}>
                <Link
                  href={`/500/${g.code}`}
                  className="flex justify-between px-4 py-3 hover:bg-muted"
                >
                  <span className="font-mono font-semibold">{g.code}</span>
                  <span className="text-sm text-muted-foreground">
                    {g.status === "waiting" ? "Waiting to start" : "In progress"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
