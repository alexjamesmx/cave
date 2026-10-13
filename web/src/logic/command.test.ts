import { expect, test } from "bun:test";
import { type CommandContext, parseCommand } from "./command.ts";

const ctx: CommandContext = {
  categories: ["food", "transport", "home"],
  habits: [
    { id: "gym", name: "Gym" },
    { id: "water_2l", name: "Water 2 L" },
  ],
  targets: [
    { id: "money", name: "Money", path: "/c/money" },
    { id: "journal", name: "Journal", path: "/c/journal" },
    { id: "settings", name: "Settings", path: "/settings" },
  ],
};
const parse = (s: string) => parseCommand(s, ctx);

test("an amount first is a money entry; leading + is income", () => {
  expect(parse("205 tacos")).toEqual({
    kind: "money",
    amount: 205,
    direction: "expense",
    category: undefined,
    title: "tacos",
  });
  expect(parse("+15,040.50 paycheck")).toMatchObject({ amount: 15040.5, direction: "income" });
  expect(parse("$12.5 uber")).toMatchObject({ amount: 12.5, title: "uber" });
  expect(parse("40")).toMatchObject({ kind: "money", amount: 40, title: "" });
});

test("category only from a known #tag, never guessed from the words", () => {
  expect(parse("205 tacos #food")).toMatchObject({ category: "food", title: "tacos" });
  expect(parse("205 food")).toMatchObject({ category: undefined, title: "food" });
  expect(parse("90 #gifts for mom")).toMatchObject({
    category: undefined,
    title: "#gifts for mom",
  });
  expect(parse("90 x #food #home").kind).toBe("reject");
});

test("malformed amounts are rejected, not half-read", () => {
  expect(parse("2x tacos").kind).toBe("reject");
  expect(parse("12.345 tacos").kind).toBe("reject");
});

test("todo, habits, ask and jump", () => {
  expect(parse("todo ship v0.1")).toEqual({ kind: "task", title: "ship v0.1" });
  expect(parse("GYM")).toEqual({ kind: "habit", habit: "gym" });
  expect(parse("water 2 l")).toEqual({ kind: "habit", habit: "water_2l" });
  expect(parse("? how much on food")).toEqual({ kind: "ask", question: "how much on food" });
  expect(parse("> money")).toEqual({ kind: "jump", path: "/c/money" });
  expect(parse(">jour")).toEqual({ kind: "jump", path: "/c/journal" });
  expect(parse("> nowhere").kind).toBe("reject");
});

test("anything else is rejected with a hint", () => {
  const result = parse("buy milk");
  expect(result.kind).toBe("reject");
  expect(result.kind === "reject" && result.hint).toContain("todo");
});
