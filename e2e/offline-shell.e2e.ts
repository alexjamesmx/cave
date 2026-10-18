import { addMoney, offOriginRequests, ownerContext, syncBadge } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("after one online visit the app opens offline with its data", async ({ browser, baseURL }) => {
  const context = await ownerContext(browser);
  const foreign = offOriginRequests(context, baseURL as string);
  const page = await context.newPage();

  await page.goto("/");
  await expect(syncBadge(page)).toHaveText("SYNCED");
  await addMoney(page, { amount: 317, title: "shell check", category: "Food" });
  await expect(
    page.getByRole("status").filter({ hasText: "Saved · Expense · shell check" }),
  ).toBeVisible();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  // The page warms the shell cache once the worker is ready; wait until "/" is in it.
  await page.waitForFunction(async () =>
    Boolean(await (await caches.open("cave-shell")).match("/")),
  );

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "What's the move?" })).toBeVisible();
  // The spent tile counts this month's entries from IndexedDB, so it shows without the server.
  await expect(page.getByRole("link", { name: /Spent/ })).toContainText("entries");
  await expect(syncBadge(page)).toHaveText("OFFLINE · SAVED HERE");

  await page.goto("/c/money/table");
  await expect(page.getByRole("button", { name: "shell check" })).toBeVisible();

  expect(foreign).toEqual([]);
  await context.close();
});
