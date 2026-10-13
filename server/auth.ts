import { createHash, timingSafeEqual } from "node:crypto";
import { TOKEN_PREFIX } from "./agents.ts";

const digest = (s: string) => createHash("sha256").update(s).digest();

/** The bearer token of a request, if it sent one. */
export function bearerToken(req: Request): string | undefined {
  const header = req.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
}

/** Constant-time bearer check; hashing first makes the compared buffers equal length. */
export function isAuthorized(req: Request, token: string): boolean {
  const sent = bearerToken(req);
  return sent !== undefined && timingSafeEqual(digest(sent), digest(token));
}

/** Agent tokens open `/mcp` only; the owner API refuses them even when it needs no token. */
export const carriesAgentToken = (req: Request) =>
  bearerToken(req)?.startsWith(TOKEN_PREFIX) === true;
