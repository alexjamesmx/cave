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
  expect(parseRoute("/")).toEqual({ name: "redirect", to: "/projects/scene" });
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
  expect(parseRoute("/projects/activity")).toEqual(section("projects", "activity", []));
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
    ["/c/reminders", "/calendar/reminders"],
    ["/c/reminders/table", "/calendar/reminders"],
    ["/calendar/agenda", "/calendar/month"],
    ["/calendar/week", "/calendar/routine"],
    ["/", "/projects/scene"],
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
    ["/c/ideas", "/projects/ideas"],
    ["/c/projects", "/projects"],
    ["/c/leetcode", "/projects/proj-leetcode"],
    ["/c/leetcode/table", "/projects/proj-leetcode"],
    ["/projects/radar", "/projects/ideas"],
    ["/projects/notes", "/notes/all"],
    ["/projects/notes/n1", "/notes/all/n1"],
    ["/projects/proj-cave/items", "/projects/proj-cave"],
    ["/projects/proj-cave/notes", "/projects/proj-cave/pages"],
    ["/projects/proj-cave/map", "/projects/proj-cave/canvas"],
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
    ["/ai/activity", "/projects/activity"],
    ["/system", "/settings/devices"],
    ["/system/jobs", "/settings/devices/jobs"],
    ["/settings/system", "/settings/devices"],
    ["/settings/system/overview", "/settings/devices"],
    ["/settings/system/schedules", "/settings/devices/schedules"],
    ["/settings/system/notifications", "/settings/devices/notifications"],
    ["/settings/system/flows", "/flows"],
    ["/settings/system/agents", "/settings/agents"],
    ["/settings/lists", "/money/lists"],
  ];
  for (const [from, to] of cases) {
    expect([from, redirectOf(from)]).toEqual([from, to]);
    expect(parseRoute(from)).toEqual({ name: "redirect", to });
  }
  for (const current of [
    "/projects/all",
    "/projects/proj-cave/canvas",
    "/projects/ideas",
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
  expect(projectPath("proj-cave", "board")).toBe("/projects/proj-cave/board");
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
