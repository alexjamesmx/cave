import { describe, expect, test } from "bun:test";
import { formatStamp, Hlc, isStamp, parseStamp, SEED_STAMP } from "./hlc.ts";

const MIN = 60_000;

function fixedClock(start: number) {
  let t = start;
  return {
    now: () => t,
    set: (v: number) => {
      t = v;
    },
  };
}

describe("stamp format", () => {
  test("round-trips and orders by string comparison", () => {
    const a = formatStamp(5, 9, "dev-a");
    const b = formatStamp(5, 10, "dev-a");
    const c = formatStamp(6, 0, "dev-a");
    expect(a).toBe("0000000000005:0009:dev-a");
    expect(parseStamp(a)).toEqual({ ms: 5, counter: 9, deviceId: "dev-a" });
    expect(a < b && b < c).toBe(true);
  });

  test("seed stamp sorts before any real stamp", () => {
    expect(isStamp(SEED_STAMP)).toBe(true);
    expect(SEED_STAMP < formatStamp(1, 0, "a")).toBe(true);
  });

  test("rejects malformed stamps", () => {
    for (const bad of ["", "1:0:a", "0000000000001:0:a", "0000000000001:0000:", "x"]) {
      expect(isStamp(bad)).toBe(false);
    }
  });
});

describe("Hlc", () => {
  test("next() is strictly increasing even when the wall clock goes back", () => {
    const wall = fixedClock(1_000_000);
    const clock = new Hlc("a", wall.now);
    const s1 = clock.next();
    const s2 = clock.next();
    wall.set(500_000);
    const s3 = clock.next();
    expect(s1 < s2 && s2 < s3).toBe(true);
  });

  test("counter overflow carries into ms instead of breaking the format", () => {
    const clock = new Hlc("a", () => 1000, { ms: 1000, counter: 9999 });
    const s = clock.next();
    expect(isStamp(s)).toBe(true);
    expect(parseStamp(s)).toEqual({ ms: 1001, counter: 0, deviceId: "a" });
  });

  test("observe() advances past remote stamps", () => {
    const clock = new Hlc("a", () => 1000);
    const remote = formatStamp(5000, 7, "b");
    clock.observe(remote);
    expect(clock.next() > remote).toBe(true);
  });

  test("a device 10 minutes behind still orders its next write after what it has seen", () => {
    const realNow = 1_760_000_000_000;
    const ahead = new Hlc("ahead", () => realNow);
    const behind = new Hlc("behind", () => realNow - 10 * MIN);

    const remote = ahead.next();
    expect(behind.next() < remote).toBe(true);

    behind.observe(remote);
    const local = behind.next();
    expect(local > remote).toBe(true);
    expect(parseStamp(local).ms).toBe(realNow);
  });

  test("observing an older stamp does not move the clock backwards", () => {
    const clock = new Hlc("a", () => 10_000);
    const before = clock.next();
    clock.observe(formatStamp(1, 0, "b"));
    expect(clock.next() > before).toBe(true);
  });

  test("state survives a restart", () => {
    const clock = new Hlc("a", () => 100);
    clock.observe(formatStamp(9_000, 3, "b"));
    const last = clock.next();
    const restarted = new Hlc("a", () => 100, clock.state);
    expect(restarted.next() > last).toBe(true);
  });
});
