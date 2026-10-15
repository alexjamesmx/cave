import { expect, test } from "@playwright/test";
import { syncBadge } from "./helpers.ts";

test("a device whose token the server refuses says so on screen and links to Settings", async ({
  page,
}) => {
  // What a fresh Home Screen install sees when the server needs a token it doesn't have yet.
  await page.route("**/api/sync", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: '{"error":"unauthorized"}',
    }),
  );
  await page.goto("/");

  await expect(syncBadge(page)).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "TOKEN NEEDED" })).toBeVisible();
  const banner = page.getByRole("alert").filter({ hasText: "didn't accept this device's token" });
  await expect(banner).toBeVisible();
  await banner.getByRole("link", { name: "Enter the server token" }).click();
  await expect(page).toHaveURL(/\/settings$/);
});
