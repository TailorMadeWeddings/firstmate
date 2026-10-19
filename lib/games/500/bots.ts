// ponytail: rule-of-thumb computer players. They remember which cards have
// gone (public knowledge only, never anyone's hand) but don't track who is
// out of which suit or read their partner's signals. Open misère is never bid.
import {
  type Action,
  type Bid,
  type Card,
  type GameState,
  type Suit,
  type Trump,
  JOKER,
  SUITS,
  canBid,
  isMisere,
  legalPlays,
  newDeck,
  partnerOf,
  rankOf,
  strength,
  suitOf,
  trickWinner,
  trumpOf,
} from "./rules.ts";

export function botAction(s: GameState, seat: number): Action {
  if (s.phase === "bidding") return { type: "bid", bid: chooseBid(s, seat) };

  const { bid, seat: bidder } = s.contract!;
  const trump = trumpOf(bid);
  const byStrength = (cards: Card[]) =>
    [...cards].sort((a, b) => strength(a, trump) - strength(b, trump));

  if (s.phase === "kitty") {
    const sorted = byStrength(s.hands[seat]);
    // In misère the bidder wants to lose every trick, so the high cards go.
    return { type: "discard", cards: isMisere(bid) ? sorted.slice(-3) : sorted.slice(0, 3) };
  }

  const legal = byStrength(legalPlays(s.hands[seat], trump, s.led));
  const lowest = legal[0];
  const boss = bossTest(s, seat, trump);
  let card: Card;
  if (isMisere(bid)) {
    // Bidder ducks; defenders play low so the bidder is left holding the winner.
    card = lowest;
  } else if (s.trick.length === 0) {
    card = chooseLead(legal, trump, boss, seat % 2 === bidder % 2);
  } else if (trickWinner(s.trick, trump, s.led!) === partnerOf(seat)) {
    card = lowest;
  } else {
    const wins = (c: Card) => trickWinner([...s.trick, { seat, card: c }], trump, s.led!) === seat;
    const cheapest = legal.find(wins);
    // Second to play and following suit: keep a card that isn't the boss for later.
    const holdBack =
      s.trick.length === 1 && cheapest && suitOf(cheapest, trump) === s.led && !boss(cheapest);
    card = cheapest && !holdBack ? cheapest : lowest;
  }
  // Only matters when leading the joker in no-trumps; any suit will do.
  return { type: "play", card, jokerSuit: card === JOKER ? "S" : undefined };
}

/**
 * Whether a card is the highest of its suit still out. "Still out" means not
 * yet played and not in this hand, worked out from what's public.
 */
function bossTest(s: GameState, seat: number, trump: Trump) {
  const inTrick = s.trick.map((p) => p.card);
  const played = new Set(newDeck());
  for (const c of [...s.hands.flat(), ...s.kitty, ...inTrick]) played.delete(c);
  const known = new Set([...played, ...inTrick, ...s.hands[seat]]);
  // Only the bidder knows what went into the kitty.
  if (s.contract?.seat === seat) for (const c of s.kitty) known.add(c);
  const out = newDeck().filter((c) => !known.has(c));
  // ponytail: in no-trumps the joker can still beat anything; ignored here.
  return (c: Card) =>
    c === JOKER ||
    out.every(
      (o) =>
        (o === JOKER && trump === "NT") ||
        suitOf(o, trump) !== suitOf(c, trump) ||
        strength(o, trump) < strength(c, trump),
    );
}

function chooseLead(
  legal: Card[], // weakest first
  trump: Trump,
  boss: (c: Card) => boolean,
  attacking: boolean,
): Card {
  const isTrump = (c: Card) => trump !== "NT" && suitOf(c, trump) === trump;
  const trumps = legal.filter(isTrump);
  const side = legal.filter((c) => !isTrump(c));
  const strongest = (cards: Card[]) => cards[cards.length - 1];
  // The bidding side draws trumps with winners while it can.
  if (attacking && trumps.length && boss(strongest(trumps))) return strongest(trumps);
  const sideBoss = side.filter(boss);
  if (sideBoss.length) return strongest(sideBoss);
  if (attacking && trumps.length >= 3) return trumps[0];
  if (!side.length) return trumps[0];
  // Otherwise lead low from the longest side suit.
  const length = (c: Card) => side.filter((o) => suitOf(o, trump) === suitOf(c, trump)).length;
  return [...side].sort((a, b) => length(b) - length(a))[0];
}

/**
 * Tricks to expect from partner when valuing a hand. 2.5 won 65% of 1,500
 * games against the previous players; 2 and 3 did worse.
 */
const PARTNER = 2.5;

function chooseBid(s: GameState, seat: number): Bid | "pass" {
  if (s.contract?.seat === partnerOf(seat)) return "pass"; // don't bid over partner
  const hand = s.hands[seat];
  // Misère on a hand with next to nothing that could win a trick.
  const high = hand.filter((c) => c === JOKER || "TJQKA".includes(rankOf(c)));
  if (canBid(s, "MIS") && high.length <= 1 && !high.some((c) => c === JOKER || rankOf(c) === "A")) {
    return "MIS";
  }

  // Rough tricks with this suit as trumps, counting some from partner.
  const suitTricks = (t: Suit) =>
    Math.floor(
      PARTNER +
        hand.reduce((n, c) => {
          const st = strength(c, t);
          if (st >= 98) return n + 1; // joker and bowers
          if (st >= 59) return n + 0.75; // ace, king of trumps
          if (st >= 50) return n + 0.5; // other trumps
          return n + (rankOf(c) === "A" ? 0.75 : 0);
        }, 0),
    );
  // No-trumps needs an ace or a guarded king in every suit (the joker covers one).
  const stopped = (su: Suit) => {
    const cards = hand.filter((c) => c !== JOKER && c[1] === su);
    return cards.some((c) => rankOf(c) === "A") || (cards.includes("K" + su) && cards.length >= 2);
  };
  const stoppers = SUITS.filter(stopped).length + (hand.includes(JOKER) ? 1 : 0);
  const ntTricks =
    stoppers < 4
      ? 0
      : Math.floor(
          PARTNER +
            hand.reduce(
              (n, c) => n + (c === JOKER || rankOf(c) === "A" ? 1 : rankOf(c) === "K" ? 0.5 : 0),
              0,
            ),
        );

  const best = [...SUITS].sort((a, b) => suitTricks(b) - suitTricks(a))[0];
  // No-trumps scores more, so it wins a tie.
  const [trump, tricks]: [Trump, number] =
    ntTricks >= suitTricks(best) ? ["NT", ntTricks] : [best, suitTricks(best)];
  // Bid what the hand is worth straight away: points come from the bid, not
  // the tricks, so creeping up from six throws them away.
  for (let n = Math.min(tricks, 10); n >= 6; n--) {
    if (canBid(s, `${n}${trump}`)) return `${n}${trump}`;
  }
  return "pass";
}
