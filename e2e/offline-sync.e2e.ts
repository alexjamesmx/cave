import { expect, type Page, test } from "@playwright/test";

const syncBadge = (page: Page) => page.getByRole("status").filter({ hasText: /SYNC|OFFLINE/ });

test("an entry added offline syncs after reconnect and shows on a second device", async ({
  browser,
}) => {
  const laptop = await browser.newContext();
  const page = await laptop.newPage();
  await page.goto("/");
  await expect(syncBadge(page)).toHaveText("SYNCED");

  await laptop.setOffline(true);
  await page.getByLabel("Capture or jump").fill("205 e2e tacos #food");
  await page.getByLabel("Capture or jump").press("Enter");
  await expect(page.getByText("Logged −$205 e2e tacos · food")).toBeVisible();
  // The write is local; the debounced sync fails and the badge says so.
  await expect(syncBadge(page)).toHaveText("OFFLINE · SAVED HERE");

  await laptop.setOffline(false);
  await expect(syncBadge(page)).toHaveText("SYNCED");

  const phone = await browser.newContext();
  const other = await phone.newPage();
  await other.goto("/c/money/table");
  await expect(other.getByRole("button", { name: "e2e tacos" })).toBeVisible();
  await expect(other.getByRole("row", { name: /e2e tacos/ })).toContainText("$205");

  await laptop.close();
  await phone.close();
});
