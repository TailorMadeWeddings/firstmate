// ponytail: rule-of-thumb computer players. No card counting, and they never
// bid no-trumps or misère. Make them smarter if the family starts winning
// every game.
import {
  type Action,
  type Bid,
  type Card,
  type GameState,
  type Suit,
  JOKER,
  SUITS,
  canBid,
  isMisere,
  legalPlays,
  partnerOf,
  rankOf,
  strength,
  trickWinner,
  trumpOf,
} from "./rules.ts";

export function botAction(s: GameState, seat: number): Action {
  if (s.phase === "bidding") return { type: "bid", bid: chooseBid(s, seat) };

  const { bid } = s.contract!;
  const trump = trumpOf(bid);
  const weakestFirst = (cards: Card[]) =>
    [...cards].sort((a, b) => strength(a, trump) - strength(b, trump));

  if (s.phase === "kitty") {
    return { type: "discard", cards: weakestFirst(s.hands[seat]).slice(0, 3) };
  }

  const legal = weakestFirst(legalPlays(s.hands[seat], trump, s.led));
  const lowest = legal[0];
  let card: Card;
  if (isMisere(bid)) {
    // Bidder ducks; defenders play low so the bidder is left holding the winner.
    card = lowest;
  } else if (s.trick.length === 0) {
    card = legal[legal.length - 1];
  } else if (trickWinner(s.trick, trump, s.led!) === partnerOf(seat)) {
    card = lowest;
  } else {
    // Cheapest card that wins, otherwise throw away the lowest.
    card =
      legal.find((c) => trickWinner([...s.trick, { seat, card: c }], trump, s.led!) === seat) ??
      lowest;
  }
  // Only matters when leading the joker in no-trumps; any suit will do.
  return { type: "play", card, jokerSuit: card === JOKER ? "S" : undefined };
}

function chooseBid(s: GameState, seat: number): Bid | "pass" {
  if (s.contract?.seat === partnerOf(seat)) return "pass"; // don't bid over partner
  const hand = s.hands[seat];
  // Rough tricks with this suit as trumps, counting two from partner.
  const estimate = (t: Suit) =>
    Math.floor(
      2 +
        hand.reduce((n, c) => {
          const st = strength(c, t);
          if (st >= 98) return n + 1; // joker and bowers
          if (st >= 59) return n + 0.75; // ace, king of trumps
          if (st >= 50) return n + 0.5; // other trumps
          return n + (rankOf(c) === "A" ? 0.75 : 0);
        }, 0),
    );
  const best = [...SUITS].sort((a, b) => estimate(b) - estimate(a))[0];
  for (let n = 6; n <= Math.min(estimate(best), 10); n++) {
    if (canBid(s, `${n}${best}`)) return `${n}${best}`;
  }
  return "pass";
}
