"use client";

import { Bell, BellOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
import "./cards.css";

const SYMBOL: Record<Suit, string> = { S: "♠", C: "♣", D: "♦", H: "♥" };
const SUIT_NAME: Record<Suit, string> = { S: "spades", C: "clubs", D: "diamonds", H: "hearts" };
const DISPLAY_ORDER: Suit[] = ["S", "H", "C", "D"]; // alternate colours in your hand
// Screen places count clockwise from you at the bottom: bottom, left, top, right.
const SEAT_PLACES = [
  "bottom-2 left-1/2 -translate-x-1/2",
  "left-2 top-1/2 -translate-y-1/2",
  "top-2 left-1/2 -translate-x-1/2",
  "right-2 top-1/2 -translate-y-1/2",
];
/** Which way each place is from the middle of the table. */
const DIRS = [
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 0],
];
/** Where a played card lands, in rem from the middle, nudged towards its player. */
const TRICK_AT = [
  [0, 2.6],
  [-2.75, 0],
  [0, -2.6],
  [2.75, 0],
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

// Phones only let a page make sound after a tap, so the first tap anywhere unlocks it.
let audio: AudioContext | null = null;
const unlockAudio = () => {
  audio ??= new AudioContext();
  void audio.resume();
};

/** A short two-note chime. */
function chime() {
  if (!audio) return;
  const t = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.frequency.setValueAtTime(660, t);
  osc.frequency.setValueAtTime(880, t + 0.12);
  gain.gain.setValueAtTime(0.15, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  osc.connect(gain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.35);
}

function cardName(c: Card) {
  if (c === JOKER) return "the joker";
  return `${rankOf(c) === "T" ? "10" : rankOf(c)}${SYMBOL[c[1] as Suit]}`;
}

function sortHand(hand: Card[], trump: Trump) {
  const key = (c: Card) => {
    const s = suitOf(c, trump);
    return (s ? DISPLAY_ORDER.indexOf(s) : -1) * 200 - strength(c, trump);
  };
  return [...hand].sort((a, b) => key(a) - key(b));
}

// ponytail: big centre suit instead of full pip layouts, which don't read at
// phone size anyway. Corner indices stay visible when the hand overlaps.
export function PlayingCard({
  card,
  onClick,
  dim,
  raised,
  className,
  style,
}: {
  card: Card;
  onClick?: () => void;
  dim?: boolean;
  raised?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const joker = card === JOKER;
  const suit = card[1] as Suit;
  const rank = joker ? "★" : rankOf(card) === "T" ? "10" : rankOf(card);
  const pip = joker ? "" : SYMBOL[suit];
  const face = "JQK".includes(rank);
  const Tag = onClick ? "button" : "div";
  const corner = (
    <span className="flex flex-col items-center text-[13px] font-bold leading-none tracking-tighter">
      {rank}
      <span className="text-[11px]">{pip}</span>
    </span>
  );
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-label={joker ? "Joker" : `${rank} of ${SUIT_NAME[suit]}`}
      aria-pressed={onClick && raised !== undefined ? raised : undefined}
      style={style}
      className={cn(
        "relative block h-20 w-14 shrink-0 select-none rounded-lg border border-neutral-300 bg-white shadow-md transition",
        joker || isRed(suit) ? "text-red-600" : "text-neutral-900",
        dim && "brightness-[.7]",
        raised && "-translate-y-3 ring-2 ring-sky-500",
        onClick && "hover:-translate-y-1.5 focus-visible:ring-2 focus-visible:ring-sky-500",
        className,
      )}
    >
      <span className="absolute left-1 top-1">{corner}</span>
      <span className="absolute bottom-1 right-1 rotate-180">{corner}</span>
      <span className="absolute inset-0 flex items-center justify-center">
        {joker ? (
          <span className="flex flex-col items-center leading-none">
            <span className="text-3xl">★</span>
            <span className="text-[8px] font-bold tracking-widest">JOKER</span>
          </span>
        ) : face ? (
          <span
            className={cn(
              "flex h-12 w-8 flex-col items-center justify-center rounded border font-serif leading-none",
              isRed(suit) ? "border-red-200 bg-red-50" : "border-neutral-300 bg-neutral-100",
            )}
          >
            <span className="text-xl font-bold">{rank}</span>
            <span className="text-sm">{pip}</span>
          </span>
        ) : (
          <span className={rank === "A" ? "text-4xl" : "text-3xl"}>{pip}</span>
        )}
      </span>
    </Tag>
  );
}

/** Face-down cards fanned out, one per card a player is holding. */
function CardFan({ count, dim }: { count: number; dim?: boolean }) {
  return (
    <div
      role="img"
      aria-label={`${count} card${count === 1 ? "" : "s"}`}
      className={cn("flex h-7", dim && "opacity-40")}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={cn("card-back h-7 w-5 rounded-sm", i > 0 && "-ml-3.5")} />
      ))}
    </div>
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
  // First tap lifts a card, a second tap plays it, so a slip doesn't throw a card away.
  const [selected, setSelected] = useState<Card | null>(null);
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
    setSelected(null);
  };

  const trump: Trump = contract && phase !== "bidding" ? trumpOf(contract.bid) : "NT";
  const active = ["bidding", "kitty", "playing"].includes(phase);
  const myMove = active && turn === view.seat;
  const myTurn = myMove && !busy;

  // Let people know when the turn comes round to them.
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    try {
      setMuted(localStorage.getItem("500-muted") === "1");
    } catch {}
    document.addEventListener("pointerdown", unlockAudio);
    return () => document.removeEventListener("pointerdown", unlockAudio);
  }, []);
  const toggleMuted = () => {
    setMuted(!muted);
    try {
      localStorage.setItem("500-muted", muted ? "0" : "1");
    } catch {}
  };
  const wasMyMove = useRef(myMove);
  useEffect(() => {
    if (myMove && !wasMyMove.current) {
      if (!muted) chime();
      navigator.vibrate?.(150);
    }
    wasMyMove.current = myMove;
  }, [myMove, muted]);
  useEffect(() => {
    if (!myMove) return;
    const title = document.title;
    document.title = `Your turn · ${title}`;
    return () => {
      document.title = title;
    };
  }, [myMove]);
  const legal = phase === "playing" && myTurn ? legalPlays(game.hand, trump, game.led) : [];
  // "Last trick" shows the one before. It's keyed to the trick it was opened on,
  // so it closes by itself once that trick is over.
  const trickId = `${game.history.length}.${game.tricks.reduce((a, b) => a + b, 0)}`;
  const [peekAt, setPeekAt] = useState<string | null>(null);
  const canPeek = phase === "playing" && game.lastTrick !== null;
  const peeking = canPeek && peekAt === trickId;
  const between = !game.trick.length || peeking; // showing a finished trick
  const shown = between ? (game.lastTrick?.plays ?? []) : game.trick;
  const trickWonBy = between ? (game.lastTrick?.winner ?? null) : null;
  const place = (seat: number) => (seat - me + 4) % 4;

  function onCard(card: Card) {
    if (phase === "kitty") {
      setDiscards((d) =>
        d.includes(card) ? d.filter((c) => c !== card) : d.length < 3 ? [...d, card] : d,
      );
    } else if (card !== selected) {
      setSelected(card);
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
      <header className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2 sm:gap-3">
          <Link
            href="/500"
            className="whitespace-nowrap text-sm text-muted-foreground hover:underline"
          >
            ← 500
          </Link>
          <h1 className="whitespace-nowrap text-xl font-bold sm:text-2xl">Game {view.code}</h1>
        </div>
        <div className="flex items-center gap-2">
          <p className="whitespace-nowrap text-sm tabular-nums">
            Us <b>{game.scores[myTeam]}</b> · Them <b>{game.scores[1 - myTeam]}</b>
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={muted ? "Turn sound on" : "Turn sound off"}
            title={muted ? "Turn sound on" : "Turn sound off"}
            onClick={toggleMuted}
          >
            {muted ? <BellOff /> : <Bell />}
          </Button>
        </div>
      </header>

      <section
        aria-label="Table"
        className="relative h-[21rem] overflow-hidden rounded-2xl bg-emerald-800 text-emerald-50 shadow-inner"
      >
        <div className="absolute left-3 top-3 text-xs">
          {contract && phase !== "bidding" ? (
            <>
              <div className="text-sm font-semibold">
                {isMisere(contract.bid)
                  ? bidLabel(contract.bid)
                  : trump === "NT"
                    ? "No trumps"
                    : `${SYMBOL[trump]} trumps`}
              </div>
              <div className="opacity-75">
                {bidLabel(contract.bid)} by {nameOf(contract.seat)}
              </div>
              {peeking ? (
                <div className="opacity-75">Last trick</div>
              ) : (
                game.led && <div className="opacity-75">Follow {SYMBOL[game.led]}</div>
              )}
              {canPeek && (
                <button
                  type="button"
                  aria-pressed={peeking}
                  className="mt-1 underline underline-offset-2 opacity-75 hover:opacity-100"
                  onClick={() => setPeekAt(peeking ? null : trickId)}
                >
                  {peeking ? "Back to this trick" : "Last trick"}
                </button>
              )}
            </>
          ) : (
            <div className="text-sm font-semibold opacity-75">Bidding</div>
          )}
        </div>

        {[0, 1, 2, 3].map((seat) => (
          <div
            key={seat}
            className={cn("absolute flex flex-col items-center gap-1", SEAT_PLACES[place(seat)])}
          >
            {seat !== view.seat && (
              <CardFan count={game.counts[seat]} dim={sitsOut(game, seat)} />
            )}
            <div
              className={cn(
                "max-w-20 truncate rounded-full px-2 py-0.5 text-xs font-semibold",
                active && turn === seat && "bg-amber-300 text-amber-950",
              )}
            >
              {nameOf(seat)}
            </div>
            <div className="h-4 whitespace-nowrap text-xs opacity-75">{seatStatus(seat)}</div>
          </div>
        ))}

        {shown.map(({ seat, card }, i) => {
          const [x, y] = TRICK_AT[place(seat)];
          const [fromX, fromY] = DIRS[place(seat)];
          const [toX, toY] = trickWonBy === null ? [0, 0] : DIRS[place(trickWonBy)];
          return (
            <div
              key={(peeking ? "peek-" : "") + card}
              className="absolute left-1/2 top-1/2"
              style={{ transform: `translate(-50%, -50%) translate(${x}rem, ${y}rem)`, zIndex: i }}
            >
              <PlayingCard
                card={card}
                className={cn(
                  !peeking && "card-in",
                  !peeking && between && "trick-out",
                  trickWonBy === seat && "ring-2 ring-amber-300",
                )}
                style={
                  {
                    "--from-x": `${fromX * 6}rem`,
                    "--from-y": `${fromY * 6}rem`,
                    "--to-x": `${toX * 9 - x}rem`,
                    "--to-y": `${toY * 9 - y}rem`,
                  } as React.CSSProperties
                }
              />
            </div>
          );
        })}
      </section>

      {game.exposed && contract && contract.seat !== view.seat && (
        <section aria-label={`${nameOf(contract.seat)}'s open hand`} className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">{nameOf(contract.seat)}&apos;s open misère hand</p>
          <div className="hand" style={{ "--n": game.exposed.length } as React.CSSProperties}>
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
              {turn !== view.seat
                ? `${nameOf(turn)} to play…`
                : selected
                  ? `Tap ${cardName(selected)} again to play it.`
                  : "Your turn. Tap a card to pick it."}
            </p>
          ))}
      </section>

      <section
        aria-label="Your hand"
        className="hand pt-3"
        style={{ "--n": game.hand.length } as React.CSSProperties}
      >
        {sortHand(game.hand, trump).map((c) => {
          const playable = phase === "playing" && myTurn && legal.includes(c) && !namingJoker;
          const discarding = phase === "kitty" && myTurn;
          return (
            <PlayingCard
              key={c}
              card={c}
              dim={phase === "playing" && myTurn && !legal.includes(c)}
              raised={
                discarding ? discards.includes(c) : playable ? selected === c : undefined
              }
              onClick={playable || discarding ? () => onCard(c) : undefined}
            />
          );
        })}
      </section>

      {game.history.length > 0 && <ScoreHistory game={game} myTeam={myTeam} nameOf={nameOf} />}
    </main>
  );
}

function ScoreHistory({
  game,
  myTeam,
  nameOf,
}: {
  game: NonNullable<RoomView["game"]>;
  myTeam: number;
  nameOf: (seat: number) => string;
}) {
  const totals = [0, 0];
  const rows = game.history.map((h) => {
    totals[0] += h.points[0];
    totals[1] += h.points[1];
    return { h, us: totals[myTeam], them: totals[1 - myTeam] };
  });
  const n = rows.length;
  return (
    <details className="rounded-xl border px-3 py-2 text-sm">
      <summary className="cursor-pointer select-none">
        Scores · {n} hand{n === 1 ? "" : "s"} played
      </summary>
      <table className="mt-2 w-full tabular-nums">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="py-1 font-normal">Bid</th>
            <th className="py-1 text-right font-normal">Us</th>
            <th className="py-1 text-right font-normal">Them</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ h, us, them }, i) => (
            <tr key={i} className="border-t">
              <td className="py-1">
                {nameOf(h.seat)} {bidLabel(h.bid)}{" "}
                <span className={h.made ? "text-emerald-700" : "text-red-600"}>
                  {h.made ? "made" : "down"}
                </span>{" "}
                <span className="text-muted-foreground">
                  · {h.tricks} trick{h.tricks === 1 ? "" : "s"}
                </span>
              </td>
              <td className="py-1 text-right">
                <span className="text-xs text-muted-foreground">{signed(h.points[myTeam])}</span>{" "}
                <b>{us}</b>
              </td>
              <td className="py-1 text-right">
                <span className="text-xs text-muted-foreground">
                  {signed(h.points[1 - myTeam])}
                </span>{" "}
                <b>{them}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
