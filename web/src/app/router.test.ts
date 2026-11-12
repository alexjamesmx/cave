import { expect, test } from "bun:test";
import {
  collectionPath,
  flowPath,
  parseRoute,
  redirectOf,
  shortcutPath,
  withQuery,
} from "./router.ts";

const section = (s: string, tab: string, rest: string[] = []) => ({
  name: "section" as const,
  section: s,
  tab,
  rest,
});

test("sections and their tabs; an unknown tab falls back to the first", () => {
  expect(parseRoute("/")).toEqual({ name: "redirect", to: "/money/overview" });
  expect(parseRoute("/money")).toEqual(section("money", "overview"));
  expect(parseRoute("/money/subscriptions")).toEqual(section("money", "subscriptions"));
  expect(parseRoute("/money/nope")).toEqual(section("money", "overview"));
  expect(parseRoute("/calendar/routine")).toEqual(section("calendar", "routine"));
  expect(parseRoute("/flows/flow-rent")).toEqual(section("flows", "canvas", ["flow-rent"]));
  expect(parseRoute("/flows/list")).toEqual({ name: "redirect", to: "/flows" });
  expect(parseRoute("/flows/jobs/backups")).toEqual(
    section("flows", "canvas", ["jobs", "backups"]),
  );
  expect(parseRoute("/notes")).toEqual(section("notes", "all"));
  expect(parseRoute("/notes/all/01J9ABC")).toEqual(section("notes", "all", ["01J9ABC"]));
  expect(parseRoute("/notes/leetcode")).toEqual(section("notes", "leetcode"));
  expect(parseRoute("/calendar/agenda")).toEqual(section("calendar", "agenda"));
  expect(parseRoute("/settings/data/money/untagged")).toEqual(
    section("settings", "data", ["money", "untagged"]),
  );
  expect(parseRoute("/settings/devices/jobs")).toEqual(section("settings", "devices", ["jobs"]));
  expect(parseRoute("/flows/runs")).toEqual(section("flows", "runs"));
  expect(parseRoute("/money/lists")).toEqual(section("money", "lists"));
  expect(parseRoute("/r/01J9ABC")).toEqual({ name: "reminder", id: "01J9ABC" });
  expect(parseRoute("/radar")).toEqual({ name: "not-found" });
  expect(parseRoute("/notes/days")).toEqual(section("notes", "days"));
  expect(parseRoute("/notes/write")).toEqual(section("notes", "write"));
});

test("every old path redirects to its new home", () => {
  const cases: [string, string][] = [
    ["/c/money", "/money/overview"],
    ["/c/money/dashboard", "/money/overview"],
    ["/c/money/table", "/money/transactions"],
    ["/c/money/untagged", "/settings/data/money/untagged"],
    ["/c/payments", "/money/subscriptions"],
    ["/money/payments", "/money/subscriptions"],
    ["/c/payments/table", "/settings/data/payments/table"],
    ["/c/wealth", "/money/net-worth"],
    ["/money/wealth", "/money/net-worth"],
    ["/c/reminders", "/calendar/agenda"],
    ["/c/reminders/table", "/calendar/agenda"],
    ["/calendar/reminders", "/calendar/agenda"],
    ["/calendar/week", "/calendar/routine"],
    ["/", "/money/overview"],
    ["/c/journal", "/notes/write"],
    ["/c/journal/habits", "/notes/days"],
    ["/c/journal/gallery", "/notes/days"],
    ["/life", "/notes/write"],
    ["/life/diary", "/notes/write"],
    ["/life/habits", "/notes/days"],
    ["/diary", "/notes/write"],
    ["/diary/write", "/notes/write"],
    ["/diary/days", "/notes/days"],
    ["/diary/months", "/notes/days"],
    ["/diary/habits", "/notes/days"],
    ["/c/notes", "/notes/all"],
    ["/c/tasks/board", "/tasks/board"],
    ["/c/tasks/table", "/tasks/list"],
    ["/c/tasks/calendar", "/calendar/month"],
    ["/tasks/calendar", "/calendar/month"],
    ["/c/ideas", "/notes/all?topic=Ideas"],
    ["/c/ideas/board", "/notes/all?topic=Ideas"],
    ["/c/leetcode", "/notes/leetcode"],
    ["/c/leetcode/table", "/notes/leetcode"],
    // Projects was retired: its pages go to their new homes or the landing page.
    ["/c/projects", "/money/overview"],
    ["/c/parts", "/money/overview"],
    ["/c/runs", "/money/overview"],
    ["/projects", "/money/overview"],
    ["/projects/scene", "/money/overview"],
    ["/projects/all", "/money/overview"],
    ["/projects/activity", "/money/overview"],
    ["/projects/ideas", "/notes/all?topic=Ideas"],
    ["/projects/radar", "/notes/all?topic=Ideas"],
    ["/projects/proj-leetcode", "/notes/leetcode"],
    ["/projects/proj-leetcode/tracker", "/notes/leetcode"],
    ["/projects/notes", "/notes/all"],
    ["/projects/notes/n1", "/notes/all/n1"],
    ["/projects/proj-cave/canvas", "/money/overview"],
    ["/c/flows", "/flows"],
    ["/settings/flows", "/flows"],
    ["/settings/flows/flow-rent", "/flows/flow-rent"],
    ["/c/ai", "/settings/data/ai"],
    ["/c/proposals", "/settings/data/proposals"],
    ["/agents", "/settings/agents"],
    ["/ai", "/settings/agents"],
    ["/ai/setup", "/settings/agents"],
    ["/ai/overview", "/settings/agents"],
    ["/ai/agents", "/settings/agents"],
    ["/ai/flows", "/flows"],
    ["/ai/flows/flow-rent", "/flows/flow-rent"],
    ["/ai/activity", "/money/overview"],
    ["/system", "/settings/devices"],
    ["/system/jobs", "/settings/devices/jobs"],
    ["/settings/system", "/settings/devices"],
    ["/settings/system/overview", "/settings/devices"],
    ["/settings/system/schedules", "/settings/devices/schedules"],
    ["/settings/system/notifications", "/settings/devices/notifications"],
    ["/settings/system/flows", "/flows"],
    ["/settings/system/agents", "/settings/agents"],
    ["/settings/lists", "/money/lists"],
    // Ideas are notes in topic Ideas (M14), its hidden tab included.
    ["/ideas", "/notes/all?topic=Ideas"],
    ["/ideas/all", "/notes/all?topic=Ideas"],
    ["/ideas/radar", "/notes/all?topic=Ideas"],
    ["/notes/ideas", "/notes/all?topic=Ideas"],
    ["/ideas/leetcode", "/notes/leetcode"],
  ];
  for (const [from, to] of cases) {
    expect([from, redirectOf(from)]).toEqual([from, to]);
    expect(parseRoute(from)).toEqual({ name: "redirect", to });
  }
  for (const current of [
    "/notes/leetcode",
    "/calendar/agenda",
    "/money/overview",
    "/flows/flow-rent",
    "/notes",
    "/notes/all/01J9ABC",
    "/r/x",
    "/calendar",
    "/settings/devices/jobs",
    "/money/lists",
  ])
    expect(redirectOf(current)).toBeUndefined();
});

test("a redirect keeps the old query string; a target's own keys come first and win", () => {
  expect(withQuery("/notes/all", "?q=oak")).toBe("/notes/all?q=oak");
  expect(withQuery("/notes/all", "")).toBe("/notes/all");
  expect(withQuery("/notes/all?topic=Ideas", "")).toBe("/notes/all?topic=Ideas");
  expect(withQuery("/notes/all?topic=Ideas", "?q=oak&topic=Tech")).toBe(
    "/notes/all?topic=Ideas&q=oak",
  );
});

test("links to a collection or a flow go straight to their new home", () => {
  expect(collectionPath("tasks", "board")).toBe("/tasks/board");
  expect(collectionPath("money")).toBe("/money/overview");
  expect(collectionPath("proposals")).toBe("/settings/data/proposals");
  expect(flowPath("flow-rent")).toBe("/flows/flow-rent");
  expect(flowPath()).toBe("/flows");
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
