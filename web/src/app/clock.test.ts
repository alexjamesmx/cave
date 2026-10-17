import { expect, test } from "bun:test";
import { watchClock } from "./clock.ts";

test("the time is re-read when the page becomes visible, gets focus or is shown again", () => {
  const window = new EventTarget();
  const document = new EventTarget();
  let ticks = 0;
  const stop = watchClock({ window, document }, () => ticks++, 1e9);
  document.dispatchEvent(new Event("visibilitychange"));
  window.dispatchEvent(new Event("focus"));
  window.dispatchEvent(new Event("pageshow"));
  expect(ticks).toBe(3);
  stop();
  document.dispatchEvent(new Event("visibilitychange"));
  expect(ticks).toBe(3);
});
