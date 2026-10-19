import type { Metadata } from "next";
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Kidd Family Games",
  description: "Card games for the Kidd family.",
};

const games = [
  {
    name: "500",
    href: "/500",
    suit: "♥",
    blurb: "Bid, call trumps and race your partner to 500.",
    players: "4 players · 2 teams",
  },
];

export default function GamesHome() {
  return (
    <main className="min-h-screen flex flex-col items-center px-5 py-16">
      <div className="w-full max-w-3xl flex flex-col gap-10">
        <header className="relative">
          <div className="absolute right-0 top-0">
            <LogoutButton />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">
            Kidd Family Games
          </h1>
          <p className="text-muted-foreground mt-2">Pull up a chair.</p>
        </header>

        <ul className="grid gap-4 sm:grid-cols-2">
          {games.map((game) => (
            <li key={game.name}>
              <Card className="relative transition hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-3xl">
                      <Link href={game.href} className="after:absolute after:inset-0">
                        {game.name}
                      </Link>{" "}
                      <span className="text-red-600" aria-hidden>
                        {game.suit}
                      </span>
                    </CardTitle>
                    <Badge variant="secondary">Online</Badge>
                  </div>
                  <CardDescription>{game.blurb}</CardDescription>
                  <p className="text-xs text-muted-foreground">
                    {game.players}
                  </p>
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
