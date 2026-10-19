// Australian 500 for four players, with the Kidd family's house rules:
// misère is 250 and open misère 500, no bidding again after you pass, the
// defenders can't pass 500 on trick points, and the joker is the top card in
// no-trumps too.
//
// Seats run clockwise: 0 = you (south), 1 = left, 2 = partner, 3 = right.
// Teams are seat % 2, so seats 0 and 2 play together.

export type Suit = "S" | "C" | "D" | "H";
export type Trump = Suit | "NT";
/** Rank then suit, e.g. "TH" is the 10 of hearts. */
export type Card = string;
/** "7H", "10NT", "MIS" (misère) or "OMIS" (open misère). */
export type Bid = string;
export type Play = { seat: number; card: Card };
export type HandResult = {
  seat: number;
  bid: Bid;
  made: boolean;
  /** Tricks the bidding side took. */
  tricks: number;
  points: [number, number];
};

export type Action =
  | { type: "bid"; bid: Bid | "pass" }
  | { type: "discard"; cards: Card[] }
  | { type: "play"; card: Card; jokerSuit?: Suit }
  | { type: "nextHand" };

export type GameState = {
  phase: "bidding" | "kitty" | "playing" | "handOver" | "gameOver";
  dealer: number;
  turn: number;
  hands: Card[][];
  kitty: Card[];
  /** Each seat's latest call this hand. */
  calls: (Bid | "pass" | null)[];
  /** Highest bid so far; the contract once bidding ends. */
  contract: { seat: number; bid: Bid } | null;
  trick: Play[];
  /** Suit to follow. A joker led in no-trumps takes the suit its player names. */
  led: Suit | null;
  lastTrick: { plays: Play[]; winner: number } | null;
  /** Tricks won this hand, per seat. */
  tricks: number[];
  scores: [number, number];
  result: HandResult | null;
  /** Every hand scored so far this game. */
  history: HandResult[];
  winner: number | null;
  notice: string | null;
};

export const JOKER: Card = "JOKER";
export const SUITS: Suit[] = ["S", "C", "D", "H"];
const RANKS = "456789TJQKA";
const TRUMPS: Trump[] = ["S", "C", "D", "H", "NT"];
const SAME_COLOUR: Record<Suit, Suit> = { S: "C", C: "S", D: "H", H: "D" };

// Check for the joker before using these.
export const rankOf = (c: Card) => c[0];
const rawSuit = (c: Card) => c[1] as Suit;

/** 43 cards: no 2s, 3s or black 4s, plus the joker. */
export function newDeck(): Card[] {
  const deck = [JOKER];
  for (const s of SUITS)
    for (const r of RANKS) if (r !== "4" || s === "D" || s === "H") deck.push(r + s);
  return deck;
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Every bid, lowest first. */
export const BIDS: Bid[] = [];
for (let n = 6; n <= 10; n++) for (const t of TRUMPS) BIDS.push(`${n}${t}`);
BIDS.splice(BIDS.indexOf("8S"), 0, "MIS"); // above every 7, below every 8
BIDS.splice(BIDS.indexOf("10H"), 0, "OMIS"); // above 10♦, below 10♥

export const isMisere = (b: Bid) => b === "MIS" || b === "OMIS";
export const trumpOf = (b: Bid): Trump =>
  isMisere(b) ? "NT" : (b.replace(/^\d+/, "") as Trump);

export function bidValue(b: Bid): number {
  if (isMisere(b)) return b === "MIS" ? 250 : 500;
  return 40 + (parseInt(b) - 6) * 100 + 20 * TRUMPS.indexOf(trumpOf(b));
}

export function canBid(s: Pick<GameState, "contract">, bid: Bid): boolean {
  const current = s.contract?.bid;
  if (!BIDS.includes(bid)) return false;
  if (current && BIDS.indexOf(bid) <= BIDS.indexOf(current)) return false;
  // Misère can only go over a bid of seven.
  return bid !== "MIS" || (current !== undefined && parseInt(current) === 7);
}

/**
 * The suit a card counts as once trumps are known. The left bower and the
 * joker are trumps. In no-trumps the joker has no suit (null).
 */
export function suitOf(c: Card, trump: Trump): Suit | null {
  if (c === JOKER) return trump === "NT" ? null : trump;
  if (trump !== "NT" && c === "J" + SAME_COLOUR[trump]) return trump;
  return rawSuit(c);
}

/** Joker > right bower > left bower > other trumps > everything else by rank. */
export function strength(c: Card, trump: Trump): number {
  if (c === JOKER) return 100;
  if (trump !== "NT") {
    if (c === "J" + trump) return 99;
    if (c === "J" + SAME_COLOUR[trump]) return 98;
    if (rawSuit(c) === trump) return 50 + RANKS.indexOf(rankOf(c));
  }
  return RANKS.indexOf(rankOf(c));
}

/** Follow suit if you can. Leading, or void in the led suit, anything goes. */
export function legalPlays(hand: Card[], trump: Trump, led: Suit | null): Card[] {
  if (!led) return hand;
  const follow = hand.filter((c) => suitOf(c, trump) === led);
  return follow.length ? follow : hand;
}

export function trickWinner(plays: Play[], trump: Trump, led: Suit): number {
  const power = (c: Card) => {
    const s = suitOf(c, trump);
    return c === JOKER || s === trump || s === led ? strength(c, trump) : -1;
  };
  return plays.reduce((best, p) => (power(p.card) > power(best.card) ? p : best)).seat;
}

export const partnerOf = (seat: number) => seat ^ 2;

/** In misère the bidder's partner lays their hand down and sits out. */
export function sitsOut(s: Pick<GameState, "phase" | "contract">, seat: number): boolean {
  return (
    s.phase !== "bidding" &&
    !!s.contract &&
    isMisere(s.contract.bid) &&
    seat === partnerOf(s.contract.seat)
  );
}

export function newGame(): GameState {
  return deal([0, 0], 3, []); // dealer on seat 0's right, so seat 0 bids first
}

function deal(scores: [number, number], dealer: number, history: HandResult[]): GameState {
  const deck = shuffle(newDeck());
  return {
    phase: "bidding",
    dealer,
    turn: (dealer + 1) % 4,
    hands: [0, 1, 2, 3].map((i) => deck.slice(i * 10, i * 10 + 10)),
    kitty: deck.slice(40),
    calls: [null, null, null, null],
    contract: null,
    trick: [],
    led: null,
    lastTrick: null,
    tricks: [0, 0, 0, 0],
    scores,
    result: null,
    history,
    winner: null,
    notice: null,
  };
}

/** Returns the next state, or throws if the move isn't allowed. */
export function apply(prev: GameState, seat: number, action: Action): GameState {
  const s = structuredClone(prev);
  s.notice = null;

  if (action.type === "nextHand") {
    if (s.phase !== "handOver") throw new Error("The hand isn't over");
    return deal(s.scores, (s.dealer + 1) % 4, s.history);
  }
  if (seat !== s.turn) throw new Error("Not your turn");
  const hand = s.hands[seat];

  if (action.type === "bid") {
    if (s.phase !== "bidding") throw new Error("Bidding is over");
    if (action.bid !== "pass") {
      if (!canBid(s, action.bid)) throw new Error(`Can't bid ${action.bid}`);
      s.contract = { seat, bid: action.bid };
    }
    s.calls[seat] = action.bid;
    const live = [0, 1, 2, 3].filter((i) => s.calls[i] !== "pass");
    if (live.length === 0) {
      return {
        ...deal(s.scores, (s.dealer + 1) % 4, s.history),
        notice: "Everyone passed, so it's a new deal.",
      };
    }
    if (live.length === 1 && s.contract) {
      // Only the top bidder is left: they pick up the kitty.
      s.hands[s.contract.seat].push(...s.kitty);
      s.phase = "kitty";
      s.turn = s.contract.seat;
    } else {
      do s.turn = (s.turn + 1) % 4;
      while (s.calls[s.turn] === "pass");
    }
    return s;
  }

  if (action.type === "discard") {
    const { cards } = action;
    if (
      s.phase !== "kitty" ||
      cards.length !== 3 ||
      new Set(cards).size !== 3 ||
      !cards.every((c) => hand.includes(c))
    ) {
      throw new Error("Discard 3 of your cards");
    }
    s.hands[seat] = hand.filter((c) => !cards.includes(c));
    s.kitty = cards;
    s.phase = "playing"; // the bidder leads
    return s;
  }

  if (s.phase !== "playing") throw new Error("Not playing yet");
  const { seat: bidder, bid } = s.contract!;
  const trump = trumpOf(bid);
  const { card } = action;
  if (!legalPlays(hand, trump, s.led).includes(card)) throw new Error(`Can't play ${card}`);
  if (s.trick.length === 0) {
    if (card === JOKER && trump === "NT") {
      const named = action.jokerSuit;
      if (!named || !SUITS.includes(named)) throw new Error("Name a suit for the joker");
      s.led = named;
    } else {
      s.led = suitOf(card, trump);
    }
  }
  s.hands[seat] = hand.filter((c) => c !== card);
  s.trick.push({ seat, card });

  if (s.trick.length < (isMisere(bid) ? 3 : 4)) {
    do s.turn = (s.turn + 1) % 4;
    while (sitsOut(s, s.turn));
    return s;
  }

  const winner = trickWinner(s.trick, trump, s.led!);
  s.tricks[winner]++;
  s.lastTrick = { plays: s.trick, winner };
  s.trick = [];
  s.led = null;
  s.turn = winner;
  // A misère is lost the moment the bidder takes a trick.
  if ((isMisere(bid) && winner === bidder) || s.hands[bidder].length === 0) {
    return scoreHand(s);
  }
  return s;
}

/** Scores a finished hand. Mutates and returns s. */
export function scoreHand(s: GameState): GameState {
  const { seat, bid } = s.contract!;
  const team = seat % 2;
  const them = 1 - team;
  const won = s.tricks[seat] + s.tricks[partnerOf(seat)];
  const value = bidValue(bid);
  const made = isMisere(bid) ? won === 0 : won >= parseInt(bid);

  const points: [number, number] = [0, 0];
  // Taking all ten tricks on a bid worth under 250 scores 250.
  points[team] = !made ? -value : won === 10 && value < 250 ? 250 : value;
  // Defenders get 10 a trick (nothing against misère) but can't pass 490 that way.
  const defence = isMisere(bid) ? 0 : 10 * (10 - won);
  points[them] = Math.max(0, Math.min(defence, 490 - s.scores[them]));

  s.scores[team] += points[team];
  s.scores[them] += points[them];
  s.result = { seat, bid, made, tricks: won, points };
  s.history.push(s.result);
  if (s.scores[team] >= 500) s.winner = team;
  else if (s.scores[team] <= -500) s.winner = them;
  s.phase = s.winner === null ? "handOver" : "gameOver";
  return s;
}
