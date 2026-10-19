// The kitchen screen (The Helm): PINs, unlock tokens and the wrong-PIN
// pause. Pure node:crypto, so it's testable without Next or a database.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** Unlocked for at most this long, however busy the kitchen is. */
export const UNLOCK_MINUTES = 15;
/** No taps for this long locks it again. */
export const IDLE_MINUTES = 3;
/** Wrong PINs in a row before unlocking pauses, and for how long. */
export const MAX_WRONG_PINS = 5;
export const PAUSE_MINUTES = 5;

export const isPin = (pin: string) => /^\d{4,8}$/.test(pin);

/** "salt:hash", both hex. scrypt makes each guess slow if the table ever leaked. */
export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(pin, salt, 32).toString("hex")}`;
}

export function pinMatches(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(pin, Buffer.from(salt, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

/**
 * Who unlocked, for which signed-in account and household, until when.
 * u = signed-in user on the kitchen screen, o = owner whose PIN it was.
 */
export type Unlock = { u: string; h: string; o: string; exp: number };

const mac = (key: string, body: string) =>
  createHmac("sha256", key).update(`first-mate kitchen unlock\n${body}`).digest("base64url");

/** A tamper-proof cookie value: the payload plus an HMAC only the server can make. */
export function signUnlock(payload: Unlock, key: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(key, body)}`;
}

/** The unlock, if the token is genuine, unexpired and for this account and household. */
export function readUnlock(
  token: string | undefined,
  key: string,
  who: { u: string; h: string },
  now = Date.now(),
): Unlock | null {
  const [body, sig] = (token ?? "").split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(mac(key, body));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as Unlock;
    return p.u === who.u && p.h === who.h && p.exp > now ? p : null;
  } catch {
    return null;
  }
}

/** After a wrong PIN: the new count, and when unlocking may resume if it's paused. */
export function afterWrongPin(failed: number, now = Date.now()) {
  const count = failed + 1;
  return count >= MAX_WRONG_PINS
    ? { failed: 0, lockedUntil: new Date(now + PAUSE_MINUTES * 60_000) }
    : { failed: count, lockedUntil: null };
}
