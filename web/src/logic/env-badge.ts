/** The shell's badge for a server's `CAVE_ENV`: none for production, so the live Cave looks as always. */
export function envBadge(env: unknown): string | undefined {
  if (env === "dev" || env === "test") return env.toUpperCase();
  return undefined;
}
