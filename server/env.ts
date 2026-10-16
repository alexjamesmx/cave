export const CAVE_ENVS = ["production", "dev", "test"] as const;
export type CaveEnv = (typeof CAVE_ENVS)[number];

/**
 * `CAVE_ENV`, fail-closed: unset means `dev`, and only `production` delivers anything outside
 * the Cave. Anything else stops the server, so a typo never turns notifications on.
 */
export function parseCaveEnv(
  value: string | undefined,
): { ok: true; value: CaveEnv } | { ok: false; error: string } {
  if (!value) return { ok: true, value: "dev" };
  return (CAVE_ENVS as readonly string[]).includes(value)
    ? { ok: true, value: value as CaveEnv }
    : { ok: false, error: `CAVE_ENV must be production, dev or test, got "${value}"` };
}

/** Whether notifications and anything else leaving the Cave really go out. */
export const delivers = (env: CaveEnv) => env === "production";
