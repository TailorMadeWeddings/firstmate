import assert from "node:assert/strict";
import { test } from "node:test";
import { Problem, type Tool, answer } from "./mcp.ts";

const tools: Record<string, Tool<string>> = {
  hello: { description: "Says hello", input: { type: "object" }, run: async (args, who) => ({ hi: who, to: args.name }) },
  fussy: { description: "Always unhappy", input: { type: "object" }, run: async () => { throw new Problem("Pick a date."); } },
  broken: { description: "Breaks", input: { type: "object" }, run: async () => { throw new Error("relation does not exist"); } },
};
const ask = (msg: object) => answer(msg, tools, "Ben", "Be nice.");

test("initialize agrees a protocol version", async () => {
  const known = (await ask({ id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } })) as { result: { protocolVersion: string; instructions: string } };
  assert.equal(known.result.protocolVersion, "2025-03-26");
  assert.equal(known.result.instructions, "Be nice.");
  const unknown = (await ask({ id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } })) as { result: { protocolVersion: string } };
  assert.equal(unknown.result.protocolVersion, "2025-06-18");
});

test("notifications get no reply", async () => {
  assert.equal(await ask({ method: "notifications/initialized" }), null);
});

test("lists and calls tools", async () => {
  const list = (await ask({ id: 2, method: "tools/list" })) as { result: { tools: { name: string }[] } };
  assert.deepEqual(list.result.tools.map((t) => t.name), ["hello", "fussy", "broken"]);
  assert.deepEqual(await ask({ id: 3, method: "tools/call", params: { name: "hello", arguments: { name: "Mia" } } }), {
    jsonrpc: "2.0",
    id: 3,
    result: { content: [{ type: "text", text: '{"hi":"Ben","to":"Mia"}' }] },
  });
});

test("problems go back to the model; other errors stay private", async () => {
  const fussy = (await ask({ id: 4, method: "tools/call", params: { name: "fussy" } })) as { result: { content: { text: string }[]; isError: boolean } };
  assert.equal(fussy.result.isError, true);
  assert.equal(fussy.result.content[0].text, "Pick a date.");
  const errors = console.error;
  console.error = () => {};
  const broken = (await ask({ id: 5, method: "tools/call", params: { name: "broken" } })) as { result: { content: { text: string }[] } };
  console.error = errors;
  assert.doesNotMatch(broken.result.content[0].text, /relation/);
});

test("unknown tools and methods are JSON-RPC errors", async () => {
  assert.equal(((await ask({ id: 6, method: "tools/call", params: { name: "nope" } })) as { error: { code: number } }).error.code, -32602);
  assert.equal(((await ask({ id: 7, method: "resources/list" })) as { error: { code: number } }).error.code, -32601);
});
