import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMedicare, isPersonKey, maskMedicare, medicareExpiry, medicareProblem, personColumns, personKey } from "./medical.ts";

const ID = "60000000-0000-0000-0000-000000000001";

test("records are about a grown-up or a child, by the Logbook's keys", () => {
  assert.deepEqual(personColumns(`d:${ID}`), { profile_id: null, dependent_id: ID });
  assert.deepEqual(personColumns(`p:${ID}`), { profile_id: ID, dependent_id: null });
  assert.equal(personKey({ profile_id: null, dependent_id: ID }), `d:${ID}`);
  assert.equal(isPersonKey(`p:${ID}`), true);
  assert.equal(isPersonKey("p:robert'); drop table"), false);
  assert.equal(isPersonKey(undefined), false);
});

test("Medicare numbers: ten digits, a valid check digit, printed as on the card", () => {
  assert.equal(medicareProblem("2123 45670 1"), null);
  assert.match(medicareProblem("2123 45671 1")!, /doesn't add up/); // one digit off
  assert.match(medicareProblem("212345670")!, /10 digits/);
  assert.match(medicareProblem("7123456701")!, /starts with/);
  assert.equal(formatMedicare("2123456701"), "2123 45670 1");
  assert.equal(maskMedicare("2123456701"), "•••• ••••0 1");
});

test("Medicare expiry dates, however they're typed", () => {
  assert.equal(medicareExpiry("8/29"), "08/2029");
  assert.equal(medicareExpiry("08/2029"), "08/2029");
  assert.equal(medicareExpiry("2029-08"), "08/2029");
  assert.equal(medicareExpiry("13/29"), null);
  assert.equal(medicareExpiry("soon"), null);
});
