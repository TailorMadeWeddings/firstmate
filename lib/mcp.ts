// Just enough of the Model Context Protocol for Claude to use First Mate's
// tools: JSON-RPC over plain HTTP POSTs, answered with JSON (Streamable HTTP
// without the streaming or sessions). Pure apart from the tools it's given.

export type Tool<C> = {
  description: string;
  /** JSON Schema for the arguments. */
  input: object;
  run: (args: Record<string, unknown>, ctx: C) => Promise<unknown>;
};

/** Something the caller can fix: its message goes back to them, so the model can try again. */
export class Problem extends Error {}

const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

type Message = { id?: string | number | null; method?: string; params?: Record<string, unknown> };

/** The reply to one JSON-RPC message, or null for a notification. */
export async function answer<C>(msg: Message, tools: Record<string, Tool<C>>, ctx: C, instructions: string) {
  if (msg?.id === undefined || msg.id === null) return null;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id, result });
  const text = (t: string, isError = false) => ok({ content: [{ type: "text", text: t }], ...(isError ? { isError } : {}) });
  switch (msg.method) {
    case "initialize": {
      const asked = String(msg.params?.protocolVersion ?? "");
      return ok({
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "firstmate", version: "1.0.0" },
        instructions,
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: Object.entries(tools).map(([name, t]) => ({ name, description: t.description, inputSchema: t.input })) });
    case "tools/call": {
      const tool = tools[String(msg.params?.name)];
      if (!tool) return { jsonrpc: "2.0", id: msg.id, error: { code: -32602, message: `No tool called ${msg.params?.name}.` } };
      try {
        const out = await tool.run((msg.params?.arguments ?? {}) as Record<string, unknown>, ctx);
        return text(typeof out === "string" ? out : JSON.stringify(out));
      } catch (e) {
        if (e instanceof Problem) return text(e.message, true);
        console.error(e);
        return text("Something went wrong in First Mate. Try again.", true);
      }
    }
    default:
      return { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Unknown method ${msg.method}.` } };
  }
}
