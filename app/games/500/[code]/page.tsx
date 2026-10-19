import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getRoom } from "../actions";
import { GameRoom } from "./game-room";

export const metadata: Metadata = {
  title: "500 · Kidd Family Games",
};

export default function GamePage({ params }: { params: Promise<{ code: string }> }) {
  return (
    <Suspense fallback={<p className="p-8 text-center text-muted-foreground">Loading…</p>}>
      <Game params={params} />
    </Suspense>
  );
}

async function Game({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const room = await getRoom(code);
  if (!room) notFound();
  return <GameRoom initial={room} />;
}
