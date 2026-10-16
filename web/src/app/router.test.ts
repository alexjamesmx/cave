import { expect, test } from "bun:test";
import {
  collectionPath,
  flowPath,
  parseRoute,
  projectPath,
  redirectOf,
  shortcutPath,
} from "./router.ts";

const section = (s: string, tab: string, rest: string[] = []) => ({
  name: "section" as const,
  section: s,
  tab,
  rest,
});

test("sections and their tabs; an unknown tab falls back to the first", () => {
  expect(parseRoute("/")).toEqual(section("home", "home"));
  expect(parseRoute("/money")).toEqual(section("money", "overview"));
  expect(parseRoute("/money/payments")).toEqual(section("money", "payments"));
  expect(parseRoute("/money/review")).toEqual(section("money", "review"));
  expect(parseRoute("/money/nope")).toEqual(section("money", "overview"));
  expect(parseRoute("/calendar/agenda")).toEqual(section("calendar", "agenda"));
  expect(parseRoute("/ai/flows/flow-rent")).toEqual(section("ai", "flows", ["flow-rent"]));
  expect(parseRoute("/settings/data/money/untagged")).toEqual(
    section("settings", "data", ["money", "untagged"]),
  );
  expect(parseRoute("/settings/system/jobs")).toEqual(section("settings", "system", ["jobs"]));
  expect(parseRoute("/r/01J9ABC")).toEqual({ name: "reminder", id: "01J9ABC" });
  expect(parseRoute("/radar")).toEqual({ name: "not-found" });
});

test("every old path redirects to its new home", () => {
  const cases: [string, string][] = [
    ["/c/money", "/money/overview"],
    ["/c/money/dashboard", "/money/overview"],
    ["/c/money/table", "/money/transactions"],
    ["/c/money/untagged", "/settings/data/money/untagged"],
    ["/c/payments", "/money/payments"],
    ["/c/payments/table", "/settings/data/payments/table"],
    ["/c/wealth", "/money/wealth"],
    ["/c/reminders", "/calendar/reminders"],
    ["/c/journal", "/life/diary"],
    ["/c/journal/habits", "/life/habits"],
    ["/c/tasks/board", "/tasks/board"],
    ["/c/tasks/table", "/tasks/list"],
    ["/c/ideas", "/projects/ideas"],
    ["/c/projects", "/projects"],
    ["/c/leetcode", "/projects/proj-leetcode/items"],
    ["/c/leetcode/table", "/projects/proj-leetcode/items"],
    ["/c/flows", "/ai/flows"],
    ["/c/ai", "/ai/setup"],
    ["/c/proposals", "/settings/data/proposals"],
    ["/agents", "/ai/agents"],
    ["/flows", "/ai/flows"],
    ["/flows/flow-rent", "/ai/flows/flow-rent"],
    ["/ai", "/ai/setup"],
    ["/system", "/settings/system"],
    ["/system/jobs", "/settings/system/jobs"],
  ];
  for (const [from, to] of cases) {
    expect([from, redirectOf(from)]).toEqual([from, to]);
    expect(parseRoute(from)).toEqual({ name: "redirect", to });
  }
  for (const current of ["/", "/money/overview", "/ai/setup", "/r/x", "/calendar"])
    expect(redirectOf(current)).toBeUndefined();
});

test("anything after Projects that is not a tab is a project's page", () => {
  expect(parseRoute("/projects/proj-cave/board")).toEqual({
    name: "section",
    section: "projects",
    tab: "project",
    rest: ["proj-cave", "board"],
  });
  expect(parseRoute("/projects/ideas")).toEqual({
    name: "section",
    section: "projects",
    tab: "ideas",
    rest: [],
  });
  expect(projectPath("proj-cave", "items")).toBe("/projects/proj-cave/items");
});

test("links to a collection or a flow go straight to their new home", () => {
  expect(collectionPath("tasks", "board")).toBe("/tasks/board");
  expect(collectionPath("money")).toBe("/money/overview");
  expect(collectionPath("proposals")).toBe("/settings/data/proposals");
  expect(flowPath("flow-rent")).toBe("/ai/flows/flow-rent");
  expect(flowPath()).toBe("/ai/flows");
});

test("C opens the calendar, except while typing or with a modifier", () => {
  const key = (k: string, extra: Partial<KeyboardEvent> = {}, target: unknown = null) => ({
    key: k,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    ...extra,
    target: target as EventTarget | null,
  });
  expect(shortcutPath(key("c"))).toBe("/calendar/month");
  expect(shortcutPath(key("C"))).toBe("/calendar/month");
  expect(shortcutPath(key("c", { ctrlKey: true }))).toBeUndefined();
  expect(shortcutPath(key("c", { metaKey: true }))).toBeUndefined();
  expect(shortcutPath(key("c", {}, { tagName: "INPUT" }))).toBeUndefined();
  expect(shortcutPath(key("c", {}, { tagName: "DIV", isContentEditable: true }))).toBeUndefined();
  expect(shortcutPath(key("x"))).toBeUndefined();
});
