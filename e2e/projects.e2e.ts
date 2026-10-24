import { mcpClient, ownerContext, pushed } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("the Scene: projects in every state as orbs and as a hidden list by what needs you first; the strip; a click enters the project", async ({
  browser,
  baseURL,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  // The agent creates one project per state; the owner's device picks them up on sync.
  const client = await mcpClient(baseURL as string, "scene-e2e");
  const call = async (name: string, args: Record<string, unknown>) =>
    (await client.callTool({ name, arguments: args })) as {
      structuredContent?: Record<string, unknown>;
      isError?: boolean;
    };
  const create = async (collection: string, title: string, fields: Record<string, unknown>) => {
    const r = await call("create", { collection, title, fields });
    expect(r.isError).toBeUndefined();
    return r.structuredContent?.id as string;
  };
  const stamp = Date.now();
  const ok = await create("projects", `Scene ok ${stamp}`, { status: "active" });
  await create("projects", `Scene paused ${stamp}`, { status: "paused" });
  const blocked = await create("projects", `Scene blocked ${stamp}`, { status: "active" });
  await create("parts", "Tax return", { project: blocked, status: "blocked", order: 1 });
  await create("projects", `Scene slipping ${stamp}`, { status: "active", review: "2020-01-01" });
  const waiting = await create("projects", `Scene waiting ${stamp}`, { status: "active" });
  const run = (await call("start_run", { project: waiting, title: "Sizing" })).structuredContent
    ?.id as string;
  await call("log_step", { run, title: "Position size?", status: "waiting", question: true });
  // Done and dropped projects stay off the Scene.
  await create("projects", `Scene done ${stamp}`, { status: "done" });

  await page.goto("/");
  await expect(page).toHaveURL(/\/projects\/scene$/);
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  const list = page.getByRole("list", { name: "Projects in the Scene" });
  const names = async () =>
    (await list.getByRole("link").allTextContents())
      .filter((t) => t.includes(`Scene`) && t.includes(String(stamp)))
      .map((t) => t.replace(` ${stamp}`, ""));
  await expect(async () => {
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(await names()).toEqual([
      "Scene blocked · 0% · blocked",
      "Scene waiting · waiting on you · 1 question",
      "Scene slipping · slipping",
      "Scene ok · on track",
      "Scene paused · paused",
    ]);
  }).toPass({ timeout: 20_000 });

  // The strip above the Scene lists the question and the blocked part.
  const needs = page.getByRole("region", { name: "Needs you" });
  await expect(needs.getByRole("list", { name: "Questions" })).toContainText(
    "Answer: Position size?",
  );
  await expect(needs.getByRole("list", { name: "Blocked" })).toContainText("Tax return");
  await expect(page.getByText("size = activity this week")).toBeVisible();

  // A click on the orb enters the project (the hidden link carries the orb's position).
  const link = list.getByRole("link", { name: new RegExp(`Scene ok ${stamp}`) });
  const x = Number(await link.getAttribute("data-x"));
  const y = Number(await link.getAttribute("data-y"));
  const box = await page.locator(".scene-canvas").boundingBox();
  if (!box) throw new Error("no canvas");
  await page.mouse.click(box.x + x, box.y + y);
  await expect(page).toHaveURL(new RegExp(`/projects/${ok}$`));
  await expect(page.getByRole("heading", { name: `Scene ok ${stamp}` })).toBeVisible();
  await client.close();

  // Leave the shared database as found for the Tasks board: the question task goes.
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/tasks/list");
  await page.getByRole("button", { name: "Answer: Position size?" }).click();
  await pushed(page, () => page.getByRole("button", { name: "Delete" }).click());
  await expect(page.getByRole("button", { name: "Answer: Position size?" })).toHaveCount(0);
});

test("an idea becomes a project; a part and a task show on its Overview and Board", async ({
  browser,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  const name = `Garden ${Date.now()}`;
  await page.goto("/projects/ideas");
  await page.getByLabel("New idea").fill(name);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const idea = page.getByRole("listitem").filter({ hasText: name });
  await idea.getByRole("button", { name: "Promote to project" }).click();
  await idea.getByLabel("Template").selectOption({ label: "Software" });
  await idea.getByRole("button", { name: "Create project" }).click();

  await expect(page).toHaveURL(/\/projects\/[0-9A-Z]{26}$/);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  const parts = page.getByRole("region", { name: "Parts" });
  await expect(parts.getByRole("listitem")).toHaveText([/Plan/, /Build/, /Ship/]);

  await parts.getByLabel("New part").fill("Beds");
  await parts.getByRole("button", { name: "Add part" }).click();
  await expect(parts.getByRole("listitem")).toHaveText([/Plan/, /Build/, /Ship/, /Beds/]);
  const add = page.getByRole("form", { name: "Add task" });
  await add.getByLabel("New task").fill("Buy seeds");
  await add.getByLabel("Task part").selectOption({ label: "Beds" });
  await add.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByRole("list", { name: "Open tasks" })).toContainText("Buy seedsBeds");

  await page
    .getByRole("navigation", { name: "Project tabs" })
    .getByRole("link", { name: "Board" })
    .click();
  await expect(page).toHaveURL(/\/board$/);
  const card = page
    .getByRole("region", { name: "todo" })
    .getByRole("button", { name: /Buy seeds/ });
  await expect(card).toBeVisible();

  // The idea now points at its project.
  await page.goto("/projects/ideas");
  await expect(idea.getByRole("link", { name: "Project" })).toBeVisible();

  // LeetCode's old link lands on its project.
  await page.goto("/c/leetcode");
  await expect(page).toHaveURL(/\/projects\/proj-leetcode\/items$/);
  await expect(page.getByRole("heading", { name: "LeetCode" })).toBeVisible();

  // Leave the shared database as found: the task goes, so the Tasks board looks the same.
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/tasks/list");
  await page.getByRole("button", { name: "Buy seeds" }).click();
  await pushed(page, () => page.getByRole("button", { name: "Delete" }).click());
  await expect(page.getByRole("button", { name: "Buy seeds" })).toHaveCount(0);
});
