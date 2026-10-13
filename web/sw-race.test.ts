import { expect, test } from "bun:test";
import { networkWithin } from "./sw-race.ts";

/** A sleep the test releases by hand, so no real time passes. */
function manualSleep() {
  let release: () => void = () => {};
  const sleep = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  return { sleep, timeout: () => release() };
}

function deferred() {
  let resolve: (r: Response) => void = () => {};
  let reject: (e: unknown) => void = () => {};
  const promise = new Promise<Response>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const body = (r: Response) => r.text();
const cachedCopy = async () => new Response("cached");
const nothing = async () => undefined;

test("a fast network answer wins and the cache is not read", async () => {
  const clock = manualSleep();
  let read = false;
  const answer = networkWithin(
    Promise.resolve(new Response("fresh")),
    async () => {
      read = true;
      return new Response("cached");
    },
    3000,
    clock.sleep,
  );
  expect(await body(await answer)).toBe("fresh");
  expect(read).toBe(false);
});

test("a slow network: the cache answers at the timeout; the late response still arrives", async () => {
  const clock = manualSleep();
  const net = deferred();
  const answer = networkWithin(net.promise, cachedCopy, 3000, clock.sleep);
  clock.timeout();
  expect(await body(await answer)).toBe("cached");
  // The caller's own network promise is untouched, so its cache update still runs.
  net.resolve(new Response("late"));
  expect(await body(await net.promise)).toBe("late");
});

test("a slow network with nothing cached keeps waiting for the network", async () => {
  const clock = manualSleep();
  const net = deferred();
  const answer = networkWithin(net.promise, nothing, 3000, clock.sleep);
  clock.timeout();
  net.resolve(new Response("eventually"));
  expect(await body(await answer)).toBe("eventually");
});

test("a failing network falls back to the cache at once, or rethrows with no cache", async () => {
  const clock = manualSleep();
  const offline = Promise.reject(new TypeError("Failed to fetch"));
  expect(await body(await networkWithin(offline, cachedCopy, 3000, clock.sleep))).toBe("cached");
  await expect(
    networkWithin(Promise.reject(new TypeError("Failed to fetch")), nothing, 3000, clock.sleep),
  ).rejects.toThrow("Failed to fetch");
});
