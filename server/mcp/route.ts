import {
  createMcpHandler,
  hostHeaderValidationResponse,
  originValidationResponse,
} from "@modelcontextprotocol/server";
import type { Agent, AgentRegistry } from "../agents.ts";
import { bearerToken } from "../auth.ts";
import { buildServer, type McpDeps } from "./server.ts";

const unauthorized = () =>
  Response.json(
    { jsonrpc: "2.0", error: { code: -32001, message: "agent token required" }, id: null },
    { status: 401, headers: { "www-authenticate": 'Bearer realm="cave"' } },
  );

/**
 * `/mcp`: DNS-rebinding checks first (`Host` must be an allowed name; a present `Origin`
 * must be too), then an agent token, always — even on loopback — so every action has a
 * named actor. One handler serves every agent: the factory builds that agent's tools.
 */
export function createMcpRoute(options: {
  agents: AgentRegistry;
  deps: McpDeps;
  allowedHosts: string[];
}) {
  const handler = createMcpHandler((ctx) => {
    const agent = (ctx.authInfo?.extra as { agent?: Agent } | undefined)?.agent;
    if (!agent) throw new Error("MCP request reached the handler without an agent");
    return buildServer(agent, options.deps);
  });

  return (req: Request): Promise<Response> | Response => {
    const rejected =
      hostHeaderValidationResponse(req, options.allowedHosts) ??
      originValidationResponse(req, options.allowedHosts);
    if (rejected) return rejected;
    const token = bearerToken(req);
    const agent = token ? options.agents.authenticate(token) : undefined;
    if (!token || !agent) return unauthorized();
    return handler.fetch(req, {
      authInfo: { token, clientId: agent.name, scopes: agent.scopes, extra: { agent } },
    });
  };
}
