import { offOriginRequests, ownerContext, pushed } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("Home: no command grammar, the Ask box opens Claude, quick forms save, and the glance updates live", async ({
  browser,
  baseURL,
}) => {
  const context = await ownerContext(browser);
  const foreign = offOriginRequests(context, baseURL as string);
  await context.route("https://claude.ai/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<title>Claude</title>" }),
  );
  const page = await context.newPage();
  await page.goto("/");

  // The old grammar is gone: an amount is a question for the AI, not an entry.
  await expect(page.getByLabel("Capture or jump")).toHaveCount(0);
  const box = page.getByLabel("Ask or tell the Cave");
  await expect(page.getByText("Opens in Claude")).toBeVisible();
  await box.fill("317 home check");
  const popup = context.waitForEvent("page");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  expect(new URL((await popup).url()).searchParams.get("q")).toContain("317 home check");
  await page.goto("/c/money/table");
  await expect(page.getByRole("button", { name: "317 home check" })).toHaveCount(0);

  // The glance: spending with its daily rate, habits this week, flows, sync and deploy.
  await page.goto("/");
  const glance = page.getByRole("region", { name: "Glance" });
  const spent = glance.getByRole("link", { name: /Spent/ });
  await expect(spent).toContainText("a day");
  await expect(glance.getByRole("link", { name: /Habits this week/ })).toBeVisible();
  await expect(glance.getByRole("link", { name: /Flows/ })).toContainText("waiting for approval");
  await expect(glance.getByRole("link", { name: /Sync and deploy/ })).toContainText("synced");

  // A quick task, then the open-task count moves without a reload.
  const tasks = glance.getByRole("link", { name: /Open tasks/ });
  const before = Number((await tasks.locator(".big").textContent()) ?? "0");
  await page.getByRole("button", { name: "Task", exact: true }).click();
  const form = page.getByRole("form", { name: "Task" });
  await form.getByLabel("Title").fill("Home check task");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved · Task · Home check task" }),
  ).toBeVisible();
  await expect(tasks.locator(".big")).toHaveText(String(before + 1));

  // Leave the shared database as found: the task goes (soft-deleted, like any delete).
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/c/tasks/table");
  await page.getByRole("button", { name: "Home check task" }).click();
  await pushed(page, () => page.getByRole("button", { name: "Delete" }).click());
  await expect(page.getByRole("button", { name: "Home check task" })).toHaveCount(0);

  // Opening Claude is the one request meant to leave (answered locally above).
  expect(foreign.filter((url) => !url.startsWith("https://claude.ai/new?"))).toEqual([]);
});
