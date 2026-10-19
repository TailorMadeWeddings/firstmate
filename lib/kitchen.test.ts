import assert from "node:assert/strict";
import { test } from "node:test";
import { afterWrongPin, hashPin, isPin, pinMatches, readUnlock, signUnlock } from "./kitchen.ts";

test("PINs are 4 to 8 digits and stored as salted hashes", () => {
  for (const ok of ["1234", "00000000"]) assert.ok(isPin(ok), ok);
  for (const bad of ["123", "123456789", "12a4", " 1234", ""]) assert.ok(!isPin(bad), bad);
  const stored = hashPin("4826");
  assert.ok(!stored.includes("4826"));
  assert.notEqual(stored, hashPin("4826"), "salted: same PIN, different hash");
  assert.ok(pinMatches("4826", stored));
  assert.ok(!pinMatches("4827", stored));
  assert.ok(!pinMatches("4826", "garbage"));
});

test("unlock tokens can't be forged, reused elsewhere or kept past expiry", () => {
  const key = "server secret";
  const who = { u: "user-1", h: "home-1" };
  const now = 1_000_000;
  const token = signUnlock({ ...who, o: "owner-1", exp: now + 60_000 }, key);
  assert.equal(readUnlock(token, key, who, now)?.o, "owner-1");
  assert.equal(readUnlock(token, key, who, now + 60_000), null, "expired");
  assert.equal(readUnlock(token, "other key", who, now), null, "wrong key");
  assert.equal(readUnlock(token, key, { ...who, u: "user-2" }, now), null, "other account");
  assert.equal(readUnlock(token, key, { ...who, h: "home-2" }, now), null, "other household");
  // Stretching the expiry breaks the signature.
  const [body, sig] = token.split(".");
  const longer = Buffer.from(
    JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), exp: now + 9e9 }),
  ).toString("base64url");
  assert.equal(readUnlock(`${longer}.${sig}`, key, who, now), null, "tampered");
  for (const junk of [undefined, "", "abc", "a.b.c", ".", `${body}.`]) {
    assert.equal(readUnlock(junk, key, who, now), null, String(junk));
  }
});

test("five wrong PINs in a row pause unlocking for five minutes", () => {
  let state = { failed: 0, lockedUntil: null as Date | null };
  for (let i = 0; i < 4; i++) state = afterWrongPin(state.failed, 0);
  assert.deepEqual(state, { failed: 4, lockedUntil: null });
  state = afterWrongPin(state.failed, 0);
  assert.equal(state.failed, 0);
  assert.equal(state.lockedUntil?.getTime(), 5 * 60_000);
});
