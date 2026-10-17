import { addMoney, offOriginRequests, ownerContext, syncBadge } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("an entry added offline syncs after reconnect and shows on a second device", async ({
  browser,
  baseURL,
}) => {
  const laptop = await ownerContext(browser);
  const foreign = offOriginRequests(laptop, baseURL as string);
  const page = await laptop.newPage();
  await page.goto("/");
  await expect(syncBadge(page)).toHaveText("SYNCED");

  await laptop.setOffline(true);
  await addMoney(page, { amount: 205, title: "e2e tacos", category: "Food" });
  await expect(
    page.getByRole("status").filter({ hasText: "Saved · Expense · e2e tacos" }),
  ).toBeVisible();
  // The write is local; the debounced sync fails and the badge says so.
  await expect(syncBadge(page)).toHaveText("OFFLINE · SAVED HERE");

  await laptop.setOffline(false);
  await expect(syncBadge(page)).toHaveText("SYNCED");

  const phone = await ownerContext(browser);
  const other = await phone.newPage();
  await other.goto("/c/money/table");
  await expect(other.getByRole("button", { name: "e2e tacos" })).toBeVisible();
  await expect(other.getByRole("row", { name: /e2e tacos/ })).toContainText("$205");

  expect(foreign).toEqual([]);
  await laptop.close();
  await phone.close();
});
