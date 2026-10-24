import { offOriginRequests, ownerContext, pushed } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("Ask from anywhere: ⌘K opens the sheet, the box opens Claude, a quick form saves and the sheet closes with a toast", async ({
  browser,
  baseURL,
}) => {
  const context = await ownerContext(browser, { viewport: { width: 1360, height: 900 } });
  const foreign = offOriginRequests(context, baseURL as string);
  await context.route("https://claude.ai/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<title>Claude</title>" }),
  );
  const page = await context.newPage();
  await page.goto("/money/transactions");

  // No Home: the app opens on Projects, and nothing takes a command grammar.
  await page.goto("/");
  await expect(page).toHaveURL(/\/projects\/all$/);
  await expect(page.getByLabel("Capture or jump")).toHaveCount(0);

  // The shortcut ignores keys typed into a field, so nothing may have focus.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Control+k");
  const ask = page.getByRole("dialog", { name: "Ask" });
  await expect(ask.getByText("Opens in Claude")).toBeVisible();
  await ask.getByLabel("Ask or tell the Cave").fill("317 home check");
  const popup = context.waitForEvent("page");
  await ask.getByRole("button", { name: "Ask", exact: true }).click();
  expect(new URL((await popup).url()).searchParams.get("q")).toContain("317 home check");
  await expect(ask).toHaveCount(0);
  await page.goto("/c/money/table");
  await expect(page.getByRole("button", { name: "317 home check" })).toHaveCount(0);

  // The rail's Ask opens the same sheet; a quick task saves, the sheet closes, a toast says so.
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await ask.getByRole("button", { name: "Task", exact: true }).click();
  const form = ask.getByRole("form", { name: "Task" });
  await form.getByLabel("Title").fill("Home check task");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(ask).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "Saved · Task · Home check task" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // Leave the shared database as found: the task goes (soft-deleted, like any delete).
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/c/tasks/table");
  await page.getByRole("button", { name: "Home check task" }).click();
  await pushed(page, () => page.getByRole("button", { name: "Delete" }).click());
  await expect(page.getByRole("button", { name: "Home check task" })).toHaveCount(0);

  // Opening Claude is the one request meant to leave (answered locally above).
  expect(foreign.filter((url) => !url.startsWith("https://claude.ai/new?"))).toEqual([]);
});
