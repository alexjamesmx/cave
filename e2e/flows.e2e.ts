import { addMoney, offOriginRequests, ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("a copy of Salary → save with a 100 threshold creates the task for an income of 200; Undo removes it", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const context = await ownerContext(browser);
  const foreign = offOriginRequests(context, baseURL as string);
  const page = await context.newPage();
  await page.goto("/flows/flow-salary");
  await expect(page.getByLabel("Flow name")).toHaveValue("Salary → save");

  await page.getByRole("button", { name: "Duplicate" }).click();
  await expect(page).toHaveURL(/\/flows\/(?!flow-salary)[^/]+$/);
  await expect(page.getByLabel("Flow name")).toHaveValue("Copy of Salary → save");

  // The if node on the canvas: amount ≥ 100 instead of 15,000.
  const canvas = page.getByRole("region", { name: "Flow canvas" });
  await canvas.getByRole("button", { name: /If amount >= 15000/ }).click();
  const editor = page.getByRole("complementary", { name: "Step settings" });
  const threshold = editor.getByLabel("Value");
  await threshold.fill("100");
  await threshold.blur();
  await expect(canvas.getByRole("button", { name: /If amount >= 100,/ })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("ON", { exact: true })).toBeVisible();
  const flowUrl = page.url();

  await page.goto("/");
  await addMoney(page, { amount: 200, title: "bonus", income: true });
  await expect(
    page.getByRole("status").filter({ hasText: "Saved · Income · bonus" }),
  ).toBeVisible();

  // The server runs the flow when the income syncs; a reload pulls the task it wrote.
  await expect(async () => {
    await page.goto("/c/tasks");
    await expect(page.getByText("Move 40 to invest")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });

  await page.goto(flowUrl);
  const history = page.getByRole("region", { name: "Run history" });
  await history.getByRole("button", { name: "Refresh" }).click();
  await expect(history.getByText("ok", { exact: true })).toBeVisible();
  await expect(history.getByRole("link", { name: "Move 40 to invest" })).toBeVisible();

  await history.getByRole("button", { name: "Undo" }).click();
  await expect(history.getByText("undone")).toBeVisible();
  await page.goto("/c/tasks");
  await expect(page.getByText("Move 40 to invest")).toHaveCount(0);

  await page.goto(flowUrl);
  await page.getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByText("OFF", { exact: true })).toBeVisible();

  expect(foreign).toEqual([]);
});

test("a flow built on the canvas from nothing runs when its item arrives, and Runs shows each step's outcome", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  await page.goto("/flows");
  await expect(page).toHaveURL(/\/flows$/);
  await expect(page.getByRole("navigation", { name: "Flows tabs" }).getByRole("link")).toHaveText([
    "Canvas",
    "List",
    "Runs",
  ]);
  await page.getByRole("button", { name: "New flow" }).click();
  await expect(page).toHaveURL(/\/flows\/[0-9A-Z]{26}$/);
  const name = `Canvas e2e ${Date.now()}`;
  await page.getByLabel("Flow name").fill(name);
  await page.getByLabel("Flow name").blur();

  // The trigger node, then the trigger's form: when a note is added.
  const canvas = page.getByRole("region", { name: "Flow canvas" });
  const editor = page.getByRole("complementary", { name: "Step settings" });
  await canvas.getByRole("button", { name: /Trigger · On a schedule/ }).click();
  await editor.getByLabel("Type").selectOption({ label: "When an item is added" });
  await editor.getByLabel("Collection").selectOption("notes");
  await expect(
    canvas.getByRole("button", { name: /When an item is added to notes/ }),
  ).toBeVisible();

  // The first step: create a task named after the note; the canvas draws the chain.
  await canvas.getByRole("button", { name: /Step 1 · Notify/ }).click();
  await editor.getByLabel("Type").selectOption({ label: "Create an item" });
  await editor.getByLabel("Collection").selectOption("tasks");
  await editor.getByLabel("Title").fill("Read {{item.title}}");
  await editor.getByLabel("Title").blur();
  await expect(
    canvas.getByRole("button", { name: /Create “Read \{\{item.title\}\}” in tasks/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("ON", { exact: true })).toBeVisible();
  const flowUrl = page.url();

  // A note arrives; the server runs the flow and the task appears.
  const note = `Canvas note ${Date.now()}`;
  await page.goto("/projects/notes");
  await page.getByLabel("New note").fill(note);
  await page.getByLabel("New note").press("Enter");
  await expect(async () => {
    await page.goto("/tasks/list");
    await expect(page.getByText(`Read ${note}`)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });

  // Runs: the newest run across flows, with the step's outcome and the item it wrote.
  await page.goto("/flows/runs");
  const runs = page.getByRole("region", { name: "Flow runs" });
  await runs.getByRole("button", { name: "Refresh" }).click();
  await expect(runs.getByRole("link", { name }).first()).toBeVisible();
  await expect(runs.getByRole("link", { name: `Read ${note}` })).toBeVisible();
  await expect(runs.getByText("ok", { exact: true }).first()).toBeVisible();

  // List: the flow with its status and author.
  await page.goto("/flows/list");
  const list = page.getByRole("region", { name: "Flows" });
  await expect(list.getByRole("link", { name })).toBeVisible();

  // Leave the shared database as found: the flow off, the task and the note gone.
  await page.goto(flowUrl);
  await page.getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByText("OFF", { exact: true })).toBeVisible();
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/tasks/list");
  await page.getByRole("button", { name: `Read ${note}` }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("button", { name: `Read ${note}` })).toHaveCount(0);
});
