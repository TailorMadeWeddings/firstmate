// A game of 500 between family members, as stored in Supabase (games_500).
// Pure functions, so seats, turns, computer players and who-sees-what are
// testable without a database. app/games/500/actions.ts loads and saves rooms
// around them.
import { botAction } from "./bots.ts";
import { type Action, type Card, type GameState, apply, newGame } from "./rules.ts";

export type Room = {
  code: string;
  created_by: string;
  status: "waiting" | "playing" | "finished";
  /** User id per seat. Null is an empty seat while waiting, a computer once playing. */
  seats: (string | null)[];
  state: GameState | null;
  version: number;
  winner_team: number | null;
};

/** The table as one player may see it: their own cards, nobody else's. */
export type GameView = Omit<GameState, "hands" | "kitty"> & {
  hand: Card[];
  /** The open misère bidder's cards, face up once the first trick is done. */
  exposed: Card[] | null;
  /** How many cards each seat is holding. */
  counts: number[];
};

export type RoomView = Omit<Room, "created_by" | "seats" | "state"> & {
  /** Your seat, or -1 if you're watching. */
  seat: number;
  isHost: boolean;
  /** Name per seat; null for an empty seat or a computer. */
  players: (string | null)[];
  game: GameView | null;
};

const MOVING = ["bidding", "kitty", "playing"];

export function takeSeat(room: Room, user: string, seat: number): Room {
  if (room.status !== "waiting") throw new Error("The game has started");
  if (![0, 1, 2, 3].includes(seat) || room.seats[seat]) throw new Error("That seat is taken");
  const seats = room.seats.map((id) => (id === user ? null : id));
  seats[seat] = user;
  return { ...room, seats };
}

export function start(room: Room, user: string): Room {
  if (room.status !== "waiting") throw new Error("The game has started");
  if (user !== room.created_by) throw new Error("Only the host can start the game");
  return { ...room, status: "playing", state: newGame() };
}

/** A seated player's move. Null when there's nothing to change. */
export function play(room: Room, user: string, action: Action): Room | null {
  if (room.status !== "playing" || !room.state) throw new Error("The game isn't on");
  const seat = room.seats.indexOf(user);
  if (seat < 0) throw new Error("You're not in this game");
  // Whoever taps "Next hand" first deals; later taps do nothing.
  if (action.type === "nextHand" && room.state.phase !== "handOver") return null;
  return withState(room, apply(room.state, seat, action));
}

/** One move for a computer seat, or null if it isn't a computer's turn. */
export function botMove(room: Room): Room | null {
  const s = room.state;
  if (room.status !== "playing" || !s || !MOVING.includes(s.phase) || room.seats[s.turn]) {
    return null;
  }
  return withState(room, apply(s, s.turn, botAction(s, s.turn)));
}

function withState(room: Room, state: GameState): Room {
  const over = state.phase === "gameOver";
  return {
    ...room,
    state,
    status: over ? "finished" : room.status,
    winner_team: over ? state.winner : null,
  };
}

export function viewFor(room: Room, user: string, names: Record<string, string>): RoomView {
  const { created_by, seats, state, ...rest } = room;
  const seat = seats.indexOf(user);
  let game: GameView | null = null;
  if (state) {
    const { hands, kitty, ...table } = state;
    void kitty; // the bidder's discards stay secret
    const bidder = state.contract?.seat ?? -1;
    const open = state.contract?.bid === "OMIS" && state.lastTrick !== null;
    game = {
      ...table,
      hand: seat >= 0 ? hands[seat] : [],
      exposed: open ? hands[bidder] : null,
      counts: hands.map((h) => h.length),
    };
  }
  return {
    ...rest,
    seat,
    isHost: created_by === user,
    players: seats.map((id) => (id ? (names[id] ?? "Player") : null)),
    game,
  };
}
