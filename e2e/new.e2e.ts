import { offOriginRequests, ownerContext, pushed } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("New from anywhere: ⌘K opens the sheet of forms, a task saves and the sheet closes with a toast; nothing opens Claude", async ({
  browser,
  baseURL,
}) => {
  const context = await ownerContext(browser, { viewport: { width: 1360, height: 900 } });
  const foreign = offOriginRequests(context, baseURL as string);
  const page = await context.newPage();

  // No Home: the app opens on Projects, and nothing takes a command grammar.
  await page.goto("/");
  await expect(page).toHaveURL(/\/projects\/scene$/);
  await expect(page.getByLabel("Capture or jump")).toHaveCount(0);

  // The shortcut ignores keys typed into a field, so nothing may have focus.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Control+k");
  const sheet = page.getByRole("dialog", { name: "New" });
  await expect(sheet.getByRole("button")).toContainText([
    "Money",
    "Task",
    "Reminder",
    "Payment",
    "Note",
  ]);
  await expect(sheet.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByText("Opens in Claude")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  // The rail's New opens the same sheet; a task saves, the sheet closes, a toast says so.
  await page.getByRole("button", { name: "New", exact: true }).click();
  await sheet.getByRole("button", { name: "Task", exact: true }).click();
  const form = sheet.getByRole("form", { name: "Task" });
  await form.getByLabel("Title").fill("Home check task");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "Saved · Task · Home check task" }),
  ).toBeVisible();

  // Leave the shared database as found: the task goes (soft-deleted, like any delete).
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/c/tasks/table");
  await page.getByRole("button", { name: "Home check task" }).click();
  await pushed(page, () => page.getByRole("button", { name: "Delete" }).click());
  await expect(page.getByRole("button", { name: "Home check task" })).toHaveCount(0);

  expect(foreign).toEqual([]);
});
