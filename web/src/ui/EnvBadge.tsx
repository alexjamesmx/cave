import { useEffect, useState } from "react";
import type { Status } from "../../../server/owner-api.ts";
import { ownerGet } from "../app/owner-api.ts";
import { envBadge } from "../logic/env-badge.ts";

// Remembered, so a dev copy still says so when it opens offline.
const ENV_KEY = "cave.env";

/** `DEV` or `TEST` in the corner when the server isn't production: a localhost copy of real data never passes for the live Cave. */
export function EnvBadge() {
  const [env, setEnv] = useState(() => localStorage.getItem(ENV_KEY) ?? undefined);
  useEffect(() => {
    void ownerGet<Status>("/api/status").then((s) => {
      if (!s) return;
      localStorage.setItem(ENV_KEY, s.env);
      setEnv(s.env);
    });
  }, []);
  const label = envBadge(env);
  if (!label) return null;
  return (
    <div className="env-badge" title={`This server runs with CAVE_ENV=${env}: nothing leaves it`}>
      {label}
    </div>
  );
}
