import { readFileSync } from "node:fs";

/** The last run of `cave-deploy`, as it writes `status.json`. */
export interface DeployStatus {
  sha: string;
  result: "deployed" | "failed" | "rolled-back";
  /** The release step that failed; only with `failed`. */
  step?: string;
  at: string;
  /** The commit `current` pointed at after the run; empty before the first release. */
  running: string;
}

const SHA = /^[0-9a-f]{40}$/;
const RESULTS = new Set(["deployed", "failed", "rolled-back"]);

/** Parses `status.json`; anything else, including a missing file, is `null`. */
export function readDeployStatus(path: string | undefined): DeployStatus | null {
  if (!path) return null;
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { sha, result, step, at, running } = value as Record<string, unknown>;
  if (typeof sha !== "string" || !SHA.test(sha)) return null;
  if (typeof result !== "string" || !RESULTS.has(result)) return null;
  if (step !== undefined && (typeof step !== "string" || !/^[a-z-]{1,20}$/.test(step))) return null;
  if (typeof at !== "string" || Number.isNaN(Date.parse(at))) return null;
  if (typeof running !== "string" || (running !== "" && !SHA.test(running))) return null;
  return {
    sha,
    result: result as DeployStatus["result"],
    ...(step === undefined ? {} : { step }),
    at,
    running,
  };
}
