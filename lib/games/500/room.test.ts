import assert from "node:assert/strict";
import { test } from "node:test";
import { botAction } from "./bots.ts";
import { type Room, botMove, play, start, takeSeat, viewFor } from "./room.ts";

const waiting = (): Room => ({
  code: "ABCD",
  created_by: "ben",
  status: "waiting",
  seats: ["ben", null, null, null],
  state: null,
  version: 0,
  winner_team: null,
});

test("players pick seats; taken seats and started games are off limits", () => {
  let room = takeSeat(waiting(), "mum", 2);
  room = takeSeat(room, "ben", 1); // moving frees the old seat
  assert.deepEqual(room.seats, [null, "ben", "mum", null]);
  assert.throws(() => takeSeat(room, "dad", 2));
  assert.throws(() => takeSeat(room, "dad", 7));
  assert.throws(() => start(room, "mum"), /host/);
  room = start(room, "ben");
  assert.equal(room.status, "playing");
  assert.throws(() => takeSeat(room, "dad", 3));
});

test("only seated players move, and only on their turn", () => {
  const room = start(takeSeat(waiting(), "mum", 1), "ben");
  assert.throws(() => play(room, "dad", { type: "bid", bid: "pass" }), /not in this game/);
  assert.throws(() => play(room, "mum", { type: "bid", bid: "pass" }), /turn/);
  assert.equal(play(room, "ben", { type: "nextHand" }), null);
  assert.equal(botMove(room), null); // seat 0 (ben) bids first, not a computer
});

test("you see your own cards and nobody else's", () => {
  const room = start(takeSeat(waiting(), "mum", 2), "ben");
  const view = viewFor(room, "ben", { ben: "Ben", mum: "Mum" });
  assert.deepEqual(view.game?.hand, room.state!.hands[0]);
  assert.deepEqual(view.players, ["Ben", null, "Mum", null]);
  assert.equal(view.seat, 0);
  assert.ok(view.isHost);
  const json = JSON.stringify(view);
  for (const card of [...room.state!.hands[1], ...room.state!.kitty]) assert.ok(!json.includes(`"${card}"`));
});

test("open misère hand is shown to everyone after the first trick", () => {
  let room = start(waiting(), "ben");
  room.state = { ...room.state!, phase: "kitty", turn: 1, contract: { seat: 1, bid: "OMIS" } };
  room.state.hands[1].push(...room.state.kitty);
  for (let i = 0; i < 3; i++) room = botMove(room) ?? room; // discard, then two cards
  assert.equal(viewFor(room, "ben", {}).game?.exposed, null);
  while (!room.state!.lastTrick) room = room.state!.turn === 0
    ? play(room, "ben", botAction(room.state!, 0))!
    : botMove(room)!;
  assert.deepEqual(viewFor(room, "ben", {}).game?.exposed, room.state!.hands[1]);
});

test("a game with one person and three computers runs to the end", () => {
  let room = start(waiting(), "ben");
  for (let steps = 0; room.status === "playing"; steps++) {
    assert.ok(steps < 20000, "game never ended");
    const s = room.state!;
    room = s.phase === "handOver" || s.turn === 0
      ? play(room, "ben", s.phase === "handOver" ? { type: "nextHand" } : botAction(s, 0))!
      : botMove(room)!;
  }
  assert.equal(room.status, "finished");
  assert.equal(room.winner_team, room.state!.winner);
  assert.ok(room.state!.history.length > 0);
});
