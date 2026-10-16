import { expect, test } from "bun:test";
import { TOKEN_KEY } from "./boot.ts";
import { REFUSED, UNREACHABLE, unlock } from "./lock.ts";

const storage = () => {
  const saved = new Map<string, string>();
  return { saved, setItem: (k: string, v: string) => void saved.set(k, v) };
};
const answering = (status: number) =>
  (async (_url: string, init: RequestInit) => {
    const auth = new Headers(init.headers).get("authorization");
    return new Response(null, { status: auth === "Bearer right" ? 200 : status });
  }) as unknown as typeof fetch;

test("a token the server accepts is stored, trimmed", async () => {
  const s = storage();
  expect(await unlock("  right ", answering(401), s)).toBeUndefined();
  expect(s.saved.get(TOKEN_KEY)).toBe("right");
});

test("a refused, empty or unchecked token is never stored", async () => {
  const s = storage();
  expect(await unlock("wrong", answering(401), s)).toBe(REFUSED);
  expect(await unlock("   ", answering(401), s)).toBe(REFUSED);
  expect(await unlock("wrong", answering(502), s)).toBe(UNREACHABLE);
  const offline = (async () => {
    throw new TypeError("Failed to fetch");
  }) as unknown as typeof fetch;
  expect(await unlock("right", offline, s)).toBe(UNREACHABLE);
  expect(s.saved.size).toBe(0);
});
