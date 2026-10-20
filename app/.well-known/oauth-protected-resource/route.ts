// Which sign-in the MCP server (/api/mcp) trusts (RFC 9728): First Mate's own.
export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return Response.json({ resource: `${origin}/api/mcp`, authorization_servers: [origin] });
}
