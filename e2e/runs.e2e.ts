import { mcpClient, ownerContext, pushed } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("a run an agent starts shows in the project's Activity, on its Map and in Projects → Activity, updating live", async ({
  browser,
  baseURL,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  await page.goto("/projects/all");
  await page.getByRole("textbox", { name: "New project" }).fill(`Runs e2e ${Date.now()}`);
  await page.getByLabel("Template").selectOption({ label: "Software" });
  await page.getByRole("button", { name: "New project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9A-Z]{26}$/);
  const project = new URL(page.url()).pathname.split("/")[2] as string;

  const client = await mcpClient(baseURL as string, "runs-e2e");
  const call = async (name: string, args: Record<string, unknown>) =>
    (await client.callTool({ name, arguments: args })) as {
      structuredContent?: { id: string };
      isError?: boolean;
    };

  // Devices pull every minute, and whenever the page becomes visible: the test uses the latter.
  // A busy server can answer after the first pull, so each check syncs again until it passes.
  const synced = (check: () => Promise<unknown>) =>
    expect(async () => {
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await check();
    }).toPass({ timeout: 20_000 });

  await page.goto(`/projects/${project}/activity`);
  const runs = page.getByRole("list", { name: "Project runs" });
  await expect(runs).toContainText("No runs yet.");
  // The project was made on this device; the agent sees it once it has synced up.
  let run = "";
  await expect(async () => {
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    const started = await call("start_run", { project, title: "Plan the parts" });
    expect(started.isError).toBeUndefined();
    run = started.structuredContent?.id as string;
  }).toPass({ timeout: 20_000 });
  await call("log_step", { run, title: "Read the goal", status: "done" });
  const row = runs.getByRole("button", { name: /Plan the parts/ });
  await synced(() => expect(row).toContainText("running", { timeout: 1000 }));
  await row.click();
  const steps = page.getByRole("list", { name: "Steps of Plan the parts" });
  await expect(steps.getByRole("listitem")).toHaveText([/Read the goal/]);

  // A new step arrives without a reload.
  await call("log_step", {
    run,
    title: "Drafted three parts",
    status: "running",
    detail: "Plan, Build, Ship",
  });
  await synced(() =>
    expect(steps.getByRole("listitem")).toHaveText(
      [/Read the goal/, /Drafted three parts.*Plan, Build, Ship/],
      { timeout: 1000 },
    ),
  );

  // While active, it glows on the Canvas.
  await page
    .getByRole("navigation", { name: "Project tabs" })
    .getByRole("link", { name: "Canvas" })
    .click();
  await expect(page.locator(".map-run", { hasText: "Plan the parts" })).toBeVisible();

  // A question for the owner (M11 part 4): a task the "Needs you" strip lists; the project
  // waits on it; Done answers it, and the agent reads the answer through get_project.
  const asked = await call("log_step", {
    run,
    title: "Which database?",
    status: "waiting",
    question: true,
  });
  const question = (asked.structuredContent as { question?: string } | undefined)?.question;
  expect(question).toMatch(/^[0-9A-Z]{26}$/);
  await page.goto("/projects/all");
  const needs = page.getByRole("region", { name: "Needs you" });
  await synced(() =>
    expect(needs.getByRole("list", { name: "Questions" })).toContainText(
      "Answer: Which database?",
      {
        timeout: 1000,
      },
    ),
  );
  // The run waits on the question, so the agent is not "working"; the project waits on you.
  await expect(page.locator(".project-card", { hasText: "Runs e2e" })).toContainText(
    "waiting on you · 1 question",
  );
  await needs
    .getByRole("list", { name: "Questions" })
    .getByRole("listitem")
    .filter({ hasText: "Which database?" })
    .getByRole("button", { name: "Done" })
    .click();
  await expect(needs.getByRole("list", { name: "Questions" })).toHaveCount(0);
  await expect(async () => {
    const got = (await client.callTool({ name: "get_project", arguments: { id: project } })) as {
      structuredContent?: { questions: { open: unknown[]; answered: { id: string }[] } };
    };
    expect(got.structuredContent?.questions.open).toEqual([]);
    expect(got.structuredContent?.questions.answered.map((q) => q.id)).toEqual([question]);
  }).toPass({ timeout: 20_000 });

  // Finished: it leaves the Map and shows done in Projects → Activity.
  await page.goto(`/projects/${project}/canvas`);
  await call("finish_run", { run, status: "done", summary: "Three parts drafted." });
  await synced(() =>
    expect(page.locator(".map-run", { hasText: "Plan the parts" })).toHaveCount(0, {
      timeout: 1000,
    }),
  );
  await page.goto("/projects/activity?source=agent");
  const all = page.getByRole("list", { name: "All runs" });
  await expect(all.getByRole("button", { name: /Plan the parts/ })).toContainText("done");
  await client.close();

  // Leave the shared database as found: the answered question goes, so the Tasks board looks
  // the same for the other specs.
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/tasks/list");
  await page.getByRole("button", { name: "Answer: Which database?" }).click();
  await pushed(page, () => page.getByRole("button", { name: "Delete" }).click());
  await expect(page.getByRole("button", { name: "Answer: Which database?" })).toHaveCount(0);
});
