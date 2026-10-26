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
  // The strip above can push the canvas below the fold (other specs leave due items), and a
  // click outside the viewport lands nowhere: bring the canvas on screen first.
  const scene = page.locator(".scene-canvas");
  await scene.scrollIntoViewIfNeeded();
  const box = await scene.boundingBox();
  if (!box) throw new Error("no canvas");
  await page.mouse.move(box.x + x, box.y + y);
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
  page.on("dialog", (dialog) => void dialog.accept());
  const name = `Garden ${Date.now()}`;
  await page.goto("/projects/ideas");
  await page.getByLabel("New idea").fill(name);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const idea = page.getByRole("listitem").filter({ hasText: name });
  await idea.getByRole("button", { name: "Promote to project" }).click();
  await idea.getByLabel("Template").selectOption({ label: "Software" });
  await idea.getByRole("button", { name: "Create project" }).click();

  await expect(page).toHaveURL(/\/projects\/[0-9A-Z]{26}$/);
  const project = new URL(page.url()).pathname.split("/")[2] as string;
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

  // Every project has the same tabs (M11 part 6): Overview, Board, Diagram, Canvas, Activity.
  await page.goto(`/projects/${project}`);
  const tabs = page.getByRole("navigation", { name: "Project tabs" });
  await expect(tabs.getByRole("link")).toHaveText([
    "Overview",
    "Board",
    "Pages",
    "Diagram",
    "Canvas",
    "Activity",
  ]);
  await expect(page.getByRole("region", { name: "Parts" }).getByText("current")).toBeVisible();
  await expect(page.getByRole("region", { name: "Latest from the agent" })).toContainText(
    "No agent has worked on this project yet.",
  );
  await page.getByLabel("Lives in").fill("github:alex/garden");
  await page.getByLabel("Lives in").blur();
  await expect(page.getByRole("region", { name: "Connected" })).toContainText("github:alex/garden");
  await expect(page.locator(".project-meta")).toContainText("lives in github:alex/garden");

  await tabs.getByRole("link", { name: "Diagram" }).click();
  await expect(page).toHaveURL(/\/diagram$/);
  await page.getByRole("button", { name: "Start from an example" }).click();
  const diagram = page.getByRole("region", { name: "Diagram" });
  await expect(diagram.locator("svg")).toBeVisible();
  await expect(diagram.locator("svg")).toContainText("Ship");
  await expect(diagram.locator("[style]")).toHaveCount(0);
  await expect(diagram.locator("style")).toHaveCount(0);
  await page.getByLabel("Mermaid").fill("wat\n  A --> B");
  await expect(page.getByRole("alert")).toContainText("Invalid mermaid header");
  // The last good render stays while the source is broken.
  await expect(diagram.locator("svg")).toContainText("Ship");
  await page.getByLabel("Mermaid").fill("flowchart LR\n  Seeds --> Beds");
  await page.getByLabel("Mermaid").blur();
  await expect(diagram.locator("svg")).toContainText("Seeds");
  await page.reload();
  await expect(page.getByLabel("Mermaid")).toHaveValue("flowchart LR\n  Seeds --> Beds");

  await tabs.getByRole("link", { name: "Canvas" }).click();
  await expect(page.getByRole("region", { name: "Project canvas" })).toBeVisible();
  await tabs.getByRole("link", { name: "Activity" }).click();
  await expect(page.getByRole("list", { name: "Project runs" })).toBeVisible();

  // Pages (M12 part 6): a new page, renamed, written with the editor and previewed, coloured,
  // listed, then deleted.
  await tabs.getByRole("link", { name: "Pages" }).click();
  await expect(page).toHaveURL(/\/pages$/);
  await page.getByRole("button", { name: "New page" }).click();
  await expect(page).toHaveURL(/\/pages\/[0-9A-Z]{26}$/);
  await page.getByLabel("Page title").fill("Resources");
  await page.getByLabel("Page title").blur();
  await page.getByRole("textbox", { name: "Page body" }).fill("# Links\n\n- [[Plan]] and **more**");
  await page.getByRole("textbox", { name: "Page body" }).blur();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  const preview = page.locator(".md-preview");
  await expect(preview.getByRole("heading", { name: "Links" })).toBeVisible();
  await expect(preview.locator("strong")).toHaveText("more");
  await page.getByLabel("Colour", { exact: true }).selectOption("vio");
  await page.getByRole("link", { name: "All pages" }).click();
  const pages = page.getByRole("region", { name: "Pages" });
  await expect(pages.getByRole("link", { name: /Resources/ })).toBeVisible();
  await pages.getByRole("link", { name: /Resources/ }).click();
  await expect(page.getByRole("textbox", { name: "Page body" })).toHaveValue(
    "# Links\n\n- [[Plan]] and **more**",
  );
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/pages$/);
  await expect(pages).toContainText("No pages yet");

  // Old paths: Items is the Overview, Map is the Canvas, LeetCode's link lands on its project.
  await page.goto(`/projects/${project}/items`);
  await expect(page).toHaveURL(new RegExp(`/projects/${project}$`));
  await page.goto(`/projects/${project}/map`);
  await expect(page).toHaveURL(/\/canvas$/);
  await page.goto("/c/leetcode");
  await expect(page).toHaveURL(/\/projects\/proj-leetcode$/);
  await expect(page.getByRole("heading", { name: "LeetCode" })).toBeVisible();

  // Leave the shared database as found: the task goes, so the Tasks board looks the same.
  await page.goto("/tasks/list");
  await page.getByRole("button", { name: "Buy seeds" }).click();
  await pushed(page, () => page.getByRole("button", { name: "Delete" }).click());
  await expect(page.getByRole("button", { name: "Buy seeds" })).toHaveCount(0);
});

test("LeetCode's Problems tab tracks a problem by list", async ({ browser }) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  page.on("dialog", (dialog) => void dialog.accept());
  const stamp = Date.now();

  await page.goto("/projects/proj-leetcode");

  // The learning template's tracker: a problem added by list, grouped and counted.
  await page
    .getByRole("navigation", { name: "Project tabs" })
    .getByRole("link", { name: "Problems" })
    .click();
  await expect(page).toHaveURL(/\/tracker$/);
  const add = page.getByRole("form", { name: "New problem" });
  await add.getByLabel("Number").fill("1");
  await add.getByLabel("Title").fill(`Two Sum ${stamp}`);
  await add.getByLabel("Difficulty").selectOption("easy");
  await add.getByRole("combobox", { name: "List" }).fill("blind");
  await page.getByRole("option", { name: "Blind 75" }).click();
  await add.getByRole("button", { name: "Add" }).click();
  const group = page.getByRole("rowgroup", { name: "Blind 75" });
  await expect(group.getByRole("button", { name: `Two Sum ${stamp}` })).toBeVisible();
  await expect(page.locator(".tracker-head")).toContainText(/\d+ \/ \d+/);
  await page.getByLabel("Group by").selectOption("difficulty");
  await expect(page.getByRole("rowgroup", { name: "easy" })).toContainText(`Two Sum ${stamp}`);
  await page.getByRole("button", { name: "queued", exact: true }).click();
  await expect(group.getByRole("button", { name: `Two Sum ${stamp}` })).toHaveCount(0);
  await expect(page.getByRole("rowgroup", { name: "easy" })).toContainText(`Two Sum ${stamp}`);

  // Leave the shared database as found.
  await page.getByRole("button", { name: `Two Sum ${stamp}` }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("button", { name: `Two Sum ${stamp}` })).toHaveCount(0);
});
