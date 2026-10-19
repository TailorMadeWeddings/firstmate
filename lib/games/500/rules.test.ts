import assert from "node:assert/strict";
import { test } from "node:test";
import { botAction } from "./bots.ts";
import {
  type GameState,
  BIDS,
  JOKER,
  apply,
  bidValue,
  legalPlays,
  newDeck,
  newGame,
  scoreHand,
  suitOf,
  trickWinner,
} from "./rules.ts";

test("deck has 43 different cards", () => {
  const deck = newDeck();
  assert.equal(deck.length, 43);
  assert.equal(new Set(deck).size, 43);
});

test("bids rank and score by the house rules", () => {
  const at = (b: string) => BIDS.indexOf(b);
  assert.ok(at("7NT") < at("MIS") && at("MIS") < at("8S"));
  assert.ok(at("10D") < at("OMIS") && at("OMIS") < at("10H"));
  assert.deepEqual(["6S", "7H", "10NT", "MIS", "OMIS"].map(bidValue), [40, 200, 520, 250, 500]);
});

test("left bower counts as a trump, not as its own suit", () => {
  assert.equal(suitOf("JD", "H"), "H");
  assert.deepEqual(legalPlays(["JD", "5D", "9S"], "H", "H"), ["JD"]);
  assert.deepEqual(legalPlays(["JD", "9S"], "H", "D"), ["JD", "9S"]);
});

test("joker > right bower > left bower > ace of trumps", () => {
  const plays = (cards: string[]) => cards.map((card, seat) => ({ seat, card }));
  assert.equal(trickWinner(plays(["AH", "JD", "JH", JOKER]), "H", "H"), 3);
  assert.equal(trickWinner(plays(["AH", "JD", "JH"]), "H", "H"), 2);
  assert.equal(trickWinner(plays(["AH", "JD"]), "H", "H"), 1);
  assert.equal(trickWinner(plays(["5S", "AC"]), "H", "S"), 0); // off-suit ace can't win
});

test("no-trumps: joker is top card but only playable when you can't follow", () => {
  assert.deepEqual(legalPlays([JOKER, "5S"], "NT", "S"), ["5S"]);
  assert.deepEqual(legalPlays([JOKER, "5C"], "NT", "S"), [JOKER, "5C"]);
  assert.equal(trickWinner([{ seat: 0, card: "AS" }, { seat: 1, card: JOKER }], "NT", "S"), 1);
});

const finish = (bid: string, seat: number, tricks: number[], scores: [number, number] = [0, 0]) =>
  scoreHand({ ...newGame(), phase: "playing", contract: { seat, bid }, tricks, scores });

test("scoring", () => {
  assert.deepEqual(finish("7H", 0, [5, 1, 3, 1]).scores, [200, 20]);
  assert.deepEqual(finish("7H", 0, [3, 2, 3, 2]).scores, [-200, 40]);
  assert.deepEqual(finish("7S", 1, [0, 6, 0, 4]).scores, [0, 250]); // slam on a small bid
  assert.deepEqual(finish("MIS", 2, [0, 5, 0, 5]).scores, [250, 0]);
  assert.deepEqual(finish("OMIS", 2, [0, 1, 1, 0]).scores, [-500, 0]);
  assert.deepEqual(finish("6S", 0, [3, 4, 2, 1], [0, 480]).scores, [-40, 490]); // can't pass 500 on tricks
  const won = finish("7H", 0, [5, 1, 3, 1], [350, 0]);
  assert.equal(won.phase, "gameOver");
  assert.equal(won.winner, 0);
});

test("misère: partner sits out and three play", () => {
  let s: GameState = { ...newGame(), phase: "kitty", turn: 0, contract: { seat: 0, bid: "MIS" } };
  s.hands[0].push(...s.kitty);
  while (s.phase === "kitty" || s.phase === "playing") s = apply(s, s.turn, botAction(s, s.turn));
  assert.equal(s.hands[2].length, 10);
  assert.equal(s.result?.bid, "MIS");
});

test("computer players finish whole games without an illegal move", () => {
  for (let g = 0; g < 50; g++) {
    let s = newGame();
    for (let steps = 0; s.phase !== "gameOver"; steps++) {
      assert.ok(steps < 20000, "game never ended");
      s = s.phase === "handOver"
        ? apply(s, 0, { type: "nextHand" })
        : apply(s, s.turn, botAction(s, s.turn));
    }
  }
});
