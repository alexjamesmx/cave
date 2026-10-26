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
    "Flows",
    "Runs",
  ]);
  // Every flow is a card; Salary → save shows its chain and opens its canvas.
  const yours = page.getByRole("region", { name: "Your flows" });
  await expect(yours.getByRole("link", { name: /^Salary → save/ })).toBeVisible();
  await yours.getByRole("button", { name: "New flow" }).click();
  await expect(page).toHaveURL(/\/flows\/[0-9A-Z]{26}$/);
  const name = `Canvas e2e ${Date.now()}`;
  await page.getByLabel("Flow name").fill(name);
  await page.getByLabel("Flow name").blur();

  // The trigger node, then the trigger's form: when a note is added.
  const canvas = page.getByRole("region", { name: "Flow canvas" });
  const editor = page.getByRole("complementary", { name: "Step settings" });
  await canvas.getByRole("button", { name: /Trigger · On a schedule/ }).click();
  await editor.getByLabel("Type").selectOption({ label: "When an item is added" });
  await editor.getByLabel("Collection").selectOption("ideas");
  await expect(
    canvas.getByRole("button", { name: /When an item is added to ideas/ }),
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

  // The + after the last step adds one of the picked type and opens it; Remove takes it out.
  await canvas.getByRole("button", { name: "Add a step" }).click();
  await editor.getByRole("menuitem", { name: "Notify" }).click();
  await expect(canvas.getByRole("button", { name: /Step 2 · Notify/ })).toBeVisible();
  await expect(editor.getByLabel("Type")).toHaveValue("notify");
  await editor.getByRole("button", { name: "Remove step" }).click();
  await expect(canvas.getByRole("button", { name: /Step 2/ })).toHaveCount(0);

  // Send an email: who to, the sender's name, subject and message; it needs approval if an
  // agent makes it.
  await canvas.getByRole("button", { name: "Add a step" }).click();
  await editor.getByRole("menuitem", { name: "Send an email" }).click();
  await editor.getByLabel("To").fill("friend@example.test");
  await editor.getByLabel("From name").fill("Alex");
  await editor.getByLabel("Subject").fill("New idea: {{item.title}}");
  await editor.getByLabel("Message").fill("Look at this one.\nMore tomorrow.");
  const mail = canvas.getByRole("button", { name: /Step 2 · Send an email/ });
  await expect(mail).toContainText("Email “New idea: {{item.title}}” to friend@example.test");
  await expect(mail).toContainText("needs approval");
  await editor.getByRole("button", { name: "Remove step" }).click();
  await expect(canvas.getByRole("button", { name: /Step 2/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("ON", { exact: true })).toBeVisible();
  const flowUrl = page.url();

  // An idea arrives; the server runs the flow and the task appears.
  const note = `Canvas idea ${Date.now()}`;
  await page.goto("/projects/ideas");
  await page.getByLabel("New idea").fill(note);
  await page.getByLabel("New idea").press("Enter");
  // The list shows it once the write has committed; leaving earlier could lose the write.
  await expect(page.getByRole("list", { name: "Ideas" })).toContainText(note);
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

  // The overview lists the built-in jobs too; a job opens as a read-only card, and its runs
  // sit beside the flows' under Runs. The old List path lands on the overview.
  await page.goto("/flows");
  await expect(page.getByRole("region", { name: "Your flows" })).toContainText(name);
  await page
    .getByRole("region", { name: "Built in" })
    .getByRole("link", { name: /Daily backup/ })
    .click();
  await expect(page).toHaveURL(/\/flows\/jobs\/backups$/);
  const card = page.getByRole("region", { name: "Daily backup" });
  await expect(card).toContainText("BUILT IN");
  await expect(card).toContainText("Schedule");
  await page.goto("/flows/runs?source=job");
  await expect(runs.getByRole("link", { name: "Daily backup" }).first()).toBeVisible();
  await expect(runs.getByRole("link", { name })).toHaveCount(0);
  await page.goto("/flows/list");
  await expect(page).toHaveURL(/\/flows$/);

  // Leave the shared database as found: the flow off, the task and the note gone.
  await page.goto(flowUrl);
  await page.getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByText("OFF", { exact: true })).toBeVisible();
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/tasks/list");
  await page.getByRole("button", { name: `Read ${note}` }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("button", { name: `Read ${note}` })).toHaveCount(0);
  await page.goto("/projects/ideas");
  const ideas = page.getByRole("list", { name: "Ideas" });
  await ideas.getByRole("button", { name: note, exact: true }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(ideas.getByRole("button", { name: note, exact: true })).toHaveCount(0);
});
