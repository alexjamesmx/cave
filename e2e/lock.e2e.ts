import { expect, test } from "@playwright/test";
import { E2E_TOKEN, offOriginRequests } from "./helpers.ts";

test("without a token only the lock screen renders; a wrong token is refused, the right one unlocks, and a later 401 locks again", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext();
  const foreign = offOriginRequests(context, baseURL as string);
  const page = await context.newPage();
  await page.goto("/c/money");

  // Nothing but the mark, the field and the button: no sidebar, page, names or numbers.
  await expect(page.getByRole("button", { name: "Unlock" })).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.locator("body")).toHaveText(/^\s*CaveServer tokenUnlock\s*$/);

  const field = page.getByLabel("Server token");
  await field.fill("not-the-token");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByRole("alert")).toHaveText("That token doesn't open this Cave.");
  expect(await page.evaluate(() => localStorage.getItem("cave.token"))).toBeNull();

  await field.fill(E2E_TOKEN);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();

  // The token is rotated on the server: the next sync answers 401 and the device locks.
  await page.route("**/api/sync", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: '{"error":"unauthorized"}',
    }),
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "Unlock" })).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);

  expect(foreign).toEqual([]);
});

test("Lock this device returns to the lock screen and keeps the local copy", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/");
  await page.getByLabel("Server token").fill(E2E_TOKEN);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await page.goto("/settings");
  await page.getByRole("button", { name: "Lock this device" }).click();
  await expect(page.getByRole("button", { name: "Unlock" })).toBeVisible();
  const kept = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open("cave");
        open.onsuccess = () => {
          const names = [...open.result.objectStoreNames];
          open.result.close();
          resolve(names.includes("docs"));
        };
        open.onerror = () => resolve(false);
      }),
  );
  expect(kept).toBe(true);
});
