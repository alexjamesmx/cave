/** How long the shell waits for the network before answering from the cache. */
export const NETWORK_TIMEOUT_MS = 3000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Network first, but never stuck on a weak connection: if the network has not answered
 * within `timeoutMs`, or fails, the cached copy answers instead. With nothing cached it
 * keeps waiting for the network. The caller's `network` promise keeps running either way,
 * so a late response still refreshes the cache for the next load.
 */
export async function networkWithin(
  network: Promise<Response>,
  cached: () => Promise<Response | undefined>,
  timeoutMs = NETWORK_TIMEOUT_MS,
  sleep: (ms: number) => Promise<void> = wait,
): Promise<Response> {
  const settled = network.then(
    (response) => ({ ok: true as const, response }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  const first = await Promise.race([settled, sleep(timeoutMs).then(() => "slow" as const)]);
  if (first !== "slow" && first.ok) return first.response;

  const fallback = await cached();
  if (fallback) return fallback;
  const last = first === "slow" ? await settled : first;
  if (last.ok) return last.response;
  throw last.error;
}
