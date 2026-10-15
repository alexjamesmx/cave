import { expect, test } from "bun:test";
import { deviceLabel, needsHomeScreen } from "./device-label.ts";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";
const PIXEL =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";

test("devices are named by kind and browser", () => {
  expect(deviceLabel(IPHONE)).toBe("iPhone · Safari");
  expect(deviceLabel(EDGE)).toBe("Windows · Edge");
  expect(deviceLabel(PIXEL)).toBe("Android · Chrome");
});

test("an iPhone outside the Home Screen app is told to add it first", () => {
  expect(needsHomeScreen(IPHONE, false)).toBe(true);
  expect(needsHomeScreen(IPHONE, true)).toBe(false);
  expect(needsHomeScreen(EDGE, false)).toBe(false);
});
