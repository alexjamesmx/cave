import { expect, test } from "bun:test";
import { clickTarget, fromPush } from "./sw-push.ts";

const ORIGIN = "https://cave.example.dev";
const payload = {
  web_push: 8030,
  notification: {
    title: "Pay rent",
    body: "Thu Oct 22, 09:00",
    navigate: `${ORIGIN}/r/r1`,
    tag: "reminder:r1",
    actions: [
      { action: "done", title: "Done", navigate: `${ORIGIN}/r/r1?do=done` },
      { action: "evil", title: "Evil", navigate: "https://evil.example/" },
    ],
  },
};

test("a Declarative Web Push payload becomes the notification the worker shows", () => {
  expect(fromPush(payload, ORIGIN)).toEqual({
    title: "Pay rent",
    options: {
      body: "Thu Oct 22, 09:00",
      tag: "reminder:r1",
      actions: [{ action: "done", title: "Done" }],
      data: { navigate: `${ORIGIN}/r/r1`, actions: { done: `${ORIGIN}/r/r1?do=done` } },
    },
  });
  expect(fromPush({ nope: 1 }, ORIGIN)).toBeUndefined();
  expect(fromPush(null, ORIGIN)).toBeUndefined();
});

test("links stay on this origin, and a click goes to the action's link or the notification's", () => {
  const shown = fromPush(
    { web_push: 8030, notification: { title: "x", navigate: "https://evil.example/r/1" } },
    ORIGIN,
  );
  expect(shown?.options.data.navigate).toBe(`${ORIGIN}/`);
  const data = fromPush(payload, ORIGIN)?.options.data;
  expect(clickTarget(data, "done")).toBe(`${ORIGIN}/r/r1?do=done`);
  expect(clickTarget(data, "")).toBe(`${ORIGIN}/r/r1`);
  expect(clickTarget(data, "evil")).toBe(`${ORIGIN}/r/r1`);
  expect(clickTarget(undefined, "")).toBeUndefined();
});
