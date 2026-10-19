"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { type RoomView } from "@/lib/games/500/room";
import {
  type Action,
  type Bid,
  type Card,
  type Suit,
  type Trump,
  BIDS,
  JOKER,
  bidValue,
  canBid,
  isMisere,
  legalPlays,
  rankOf,
  sitsOut,
  strength,
  suitOf,
  trumpOf,
} from "@/lib/games/500/rules";
import { cn } from "@/lib/utils";
import { createGame } from "./actions";

const SYMBOL: Record<Suit, string> = { S: "♠", C: "♣", D: "♦", H: "♥" };
const SUIT_NAME: Record<Suit, string> = { S: "spades", C: "clubs", D: "diamonds", H: "hearts" };
const DISPLAY_ORDER: Suit[] = ["S", "H", "C", "D"]; // alternate colours in your hand
// Where each seat sits on screen, counting clockwise from you at the bottom.
const PLACES = [
  "col-start-2 row-start-3",
  "col-start-1 row-start-2",
  "col-start-2 row-start-1",
  "col-start-3 row-start-2",
];
const isRed = (s: Suit) => s === "D" || s === "H";
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

function bidLabel(b: Bid | "pass") {
  if (b === "pass") return "Pass";
  if (b === "MIS") return "Misère";
  if (b === "OMIS") return "Open misère";
  const t = trumpOf(b);
  return `${parseInt(b)}${t === "NT" ? "NT" : SYMBOL[t]}`;
}

function sortHand(hand: Card[], trump: Trump) {
  const key = (c: Card) => {
    const s = suitOf(c, trump);
    return (s ? DISPLAY_ORDER.indexOf(s) : -1) * 200 - strength(c, trump);
  };
  return [...hand].sort((a, b) => key(a) - key(b));
}

export function PlayingCard({
  card,
  onClick,
  dim,
  raised,
}: {
  card: Card;
  onClick?: () => void;
  dim?: boolean;
  raised?: boolean;
}) {
  const joker = card === JOKER;
  const suit = card[1] as Suit;
  const rank = rankOf(card) === "T" ? "10" : rankOf(card);
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-label={joker ? "Joker" : `${rank} of ${SUIT_NAME[suit]}`}
      aria-pressed={onClick && raised !== undefined ? raised : undefined}
      className={cn(
        "flex h-16 w-11 shrink-0 select-none flex-col items-center justify-center rounded-md border border-neutral-300 bg-white font-semibold leading-none shadow-sm transition",
        joker || isRed(suit) ? "text-red-600" : "text-neutral-900",
        dim && "opacity-40",
        raised && "-translate-y-2 ring-2 ring-sky-500",
        onClick && "hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-sky-500",
      )}
    >
      {joker ? (
        <>
          <span className="text-xl">★</span>
          <span className="text-[9px] tracking-wide">JOKER</span>
        </>
      ) : (
        <>
          <span className="text-lg">{rank}</span>
          <span className="text-lg">{SYMBOL[suit]}</span>
        </>
      )}
    </Tag>
  );
}

export function Table({
  view,
  act,
  busy,
}: {
  view: RoomView;
  act: (action: Action) => void;
  busy: boolean;
}) {
  const [discards, setDiscards] = useState<Card[]>([]);
  const [namingJoker, setNamingJoker] = useState(false);
  const game = view.game!;
  const { phase, contract, turn } = game;

  const me = Math.max(view.seat, 0); // watchers see the table from seat 0
  const myTeam = me % 2;
  const nameOf = (seat: number) =>
    seat === view.seat ? "You" : (view.players[seat] ?? "Computer");
  const send = (action: Action) => {
    act(action);
    setDiscards([]);
    setNamingJoker(false);
  };

  const trump: Trump = contract && phase !== "bidding" ? trumpOf(contract.bid) : "NT";
  const active = ["bidding", "kitty", "playing"].includes(phase);
  const myTurn = active && turn === view.seat && !busy;
  const legal = phase === "playing" && myTurn ? legalPlays(game.hand, trump, game.led) : [];
  const shown = game.trick.length ? game.trick : (game.lastTrick?.plays ?? []);
  const trickWonBy = game.trick.length ? null : (game.lastTrick?.winner ?? null);

  function onCard(card: Card) {
    if (phase === "kitty") {
      setDiscards((d) =>
        d.includes(card) ? d.filter((c) => c !== card) : d.length < 3 ? [...d, card] : d,
      );
    } else if (card === JOKER && trump === "NT" && !game.trick.length) {
      setNamingJoker(true);
    } else {
      send({ type: "play", card });
    }
  }

  function seatStatus(seat: number) {
    if (phase === "bidding") {
      const call = game.calls[seat];
      return call ? bidLabel(call) : "";
    }
    if (sitsOut(game, seat)) return "Sitting out";
    const bid = contract?.seat === seat ? `${bidLabel(contract.bid)} · ` : "";
    const n = game.tricks[seat];
    return `${bid}${n} trick${n === 1 ? "" : "s"}`;
  }

  const r = game.result;
  const resultLine = r
    ? `${nameOf(r.seat)} ${r.made ? "made" : "went down on"} ${bidLabel(r.bid)}. Us ${signed(r.points[myTeam])}, Them ${signed(r.points[1 - myTeam])}.`
    : "";
  const winners =
    game.winner === null ? "" : `${nameOf(game.winner)} and ${nameOf(game.winner + 2)}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 px-4 py-6">
      <header className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <Link href="/500" className="text-sm text-muted-foreground hover:underline">
            ← 500
          </Link>
          <h1 className="text-2xl font-bold">Game {view.code}</h1>
        </div>
        <p className="text-sm tabular-nums">
          Us <b>{game.scores[myTeam]}</b> · Them <b>{game.scores[1 - myTeam]}</b>
        </p>
      </header>

      <section
        aria-label="Table"
        className="grid h-[22rem] grid-cols-3 grid-rows-3 place-items-center rounded-2xl bg-emerald-800 p-3 shadow-inner"
      >
        {[0, 1, 2, 3].map((seat) => {
          const played = shown.find((p) => p.seat === seat);
          return (
            <div
              key={seat}
              className={cn(
                "flex flex-col items-center gap-1 text-emerald-50",
                PLACES[(seat - me + 4) % 4],
              )}
            >
              <div
                className={cn(
                  "max-w-28 truncate rounded-full px-2 py-0.5 text-xs font-semibold",
                  active && turn === seat && "bg-amber-300 text-amber-950",
                )}
              >
                {nameOf(seat)}
              </div>
              <div className="h-4 whitespace-nowrap text-xs opacity-75">{seatStatus(seat)}</div>
              {played ? (
                <div className={cn("rounded-md", trickWonBy === seat && "ring-2 ring-amber-300")}>
                  <PlayingCard card={played.card} />
                </div>
              ) : (
                <div className="h-16 w-11 rounded-md border border-dashed border-emerald-50/30" />
              )}
            </div>
          );
        })}
        <div className="col-start-2 row-start-2 text-center text-sm text-emerald-50">
          {contract && phase !== "bidding" ? (
            <>
              <div className="font-semibold">
                {isMisere(contract.bid)
                  ? bidLabel(contract.bid)
                  : trump === "NT"
                    ? "No trumps"
                    : `${SYMBOL[trump]} trumps`}
              </div>
              {game.led && <div className="opacity-75">Follow {SYMBOL[game.led]}</div>}
            </>
          ) : (
            <div className="opacity-75">Bidding</div>
          )}
        </div>
      </section>

      {game.exposed && contract && contract.seat !== view.seat && (
        <section aria-label={`${nameOf(contract.seat)}'s open hand`} className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">{nameOf(contract.seat)}&apos;s open misère hand</p>
          <div className="flex flex-wrap gap-1">
            {sortHand(game.exposed, "NT").map((c) => (
              <PlayingCard key={c} card={c} />
            ))}
          </div>
        </section>
      )}

      <section aria-live="polite" className="min-h-24 rounded-xl border p-3 text-sm">
        {game.notice && <p className="mb-2 font-medium">{game.notice}</p>}

        {phase === "gameOver" && (
          <div className="flex flex-col gap-3">
            <p className="text-lg font-semibold">
              {winners} win{game.winner === myTeam && view.seat >= 0 ? "!" : "."}
            </p>
            <p>{resultLine}</p>
            <form action={createGame}>
              <Button className="w-full">New game</Button>
            </form>
          </div>
        )}

        {phase === "handOver" && (
          <div className="flex flex-col gap-3">
            <p>{resultLine}</p>
            {view.seat >= 0 && (
              <Button disabled={busy} onClick={() => send({ type: "nextHand" })}>
                Next hand
              </Button>
            )}
          </div>
        )}

        {phase === "bidding" &&
          (myTurn ? (
            <div className="flex flex-col gap-2">
              <p>
                Your bid
                {contract && ` (to beat: ${bidLabel(contract.bid)} by ${nameOf(contract.seat)})`}
              </p>
              <div className="grid grid-cols-5 gap-1">
                {BIDS.filter((b) => !isMisere(b)).map((b) => {
                  const t = trumpOf(b);
                  return (
                    <Button
                      key={b}
                      size="sm"
                      variant="outline"
                      disabled={!canBid(game, b)}
                      title={`${bidValue(b)} points`}
                      className={cn(t !== "NT" && isRed(t) && "text-red-600")}
                      onClick={() => send({ type: "bid", bid: b })}
                    >
                      {bidLabel(b)}
                    </Button>
                  );
                })}
              </div>
              <div className="grid grid-cols-3 gap-1">
                {(["MIS", "OMIS"] as const).map((b) => (
                  <Button
                    key={b}
                    size="sm"
                    variant="outline"
                    disabled={!canBid(game, b)}
                    title={`${bidValue(b)} points`}
                    onClick={() => send({ type: "bid", bid: b })}
                  >
                    {bidLabel(b)}
                  </Button>
                ))}
                <Button size="sm" variant="secondary" onClick={() => send({ type: "bid", bid: "pass" })}>
                  Pass
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">{nameOf(turn)} to bid…</p>
          ))}

        {phase === "kitty" &&
          (myTurn ? (
            <div className="flex items-center justify-between gap-3">
              <p>You won it with {bidLabel(contract!.bid)}. Pick 3 cards to throw out.</p>
              <Button
                disabled={discards.length !== 3}
                onClick={() => send({ type: "discard", cards: discards })}
              >
                Discard {discards.length}/3
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground">
              {nameOf(turn)} won it with {bidLabel(contract!.bid)} and is picking up the kitty…
            </p>
          ))}

        {phase === "playing" &&
          (namingJoker ? (
            <div className="flex flex-col gap-2">
              <p>Lead the joker as which suit?</p>
              <div className="grid grid-cols-5 gap-1">
                {DISPLAY_ORDER.map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant="outline"
                    className={cn(isRed(s) && "text-red-600")}
                    onClick={() => send({ type: "play", card: JOKER, jokerSuit: s })}
                  >
                    {SYMBOL[s]}
                  </Button>
                ))}
                <Button size="sm" variant="ghost" onClick={() => setNamingJoker(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className={cn(!myTurn && "text-muted-foreground")}>
              {trickWonBy !== null && `${nameOf(trickWonBy)} won the trick. `}
              {turn === view.seat ? "Your turn." : `${nameOf(turn)} to play…`}
            </p>
          ))}
      </section>

      <section aria-label="Your hand" className="flex flex-wrap justify-center gap-1 pt-2">
        {sortHand(game.hand, trump).map((c) => {
          const playable = phase === "playing" && myTurn && legal.includes(c) && !namingJoker;
          const discarding = phase === "kitty" && myTurn;
          return (
            <PlayingCard
              key={c}
              card={c}
              dim={phase === "playing" && myTurn && !legal.includes(c)}
              raised={discarding ? discards.includes(c) : undefined}
              onClick={playable || discarding ? () => onCard(c) : undefined}
            />
          );
        })}
      </section>
    </main>
  );
}
