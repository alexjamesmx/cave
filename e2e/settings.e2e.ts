import { offOriginRequests, ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("the owner's name reaches the greeting; Settings shows the server and downloads an export", async ({
  browser,
  baseURL,
}) => {
  const context = await ownerContext(browser);
  const foreign = offOriginRequests(context, baseURL as string);
  const page = await context.newPage();
  // The server, the backup and the export are under Data; the name under General.
  await page.goto("/settings/data");

  // The server backs up at start, so a fresh database already has one.
  await expect(page.getByText("Last backup")).toBeVisible();
  await expect(page.getByText("None yet")).toHaveCount(0);

  await page.goto("/settings/general");
  const pushed = page.waitForResponse(
    (r) => r.url().endsWith("/api/sync") && (r.request().postData() ?? "").includes("ownerName"),
  );
  await page.getByLabel("Your name").fill("Alex");
  await page.getByLabel("Your name").blur();
  expect((await pushed).ok()).toBe(true);

  await page.goto("/settings/data");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download export" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^cave-\d{4}-\d{2}-\d{2}T\d{6}\.json$/);
  const exported = JSON.parse(await (await file.createReadStream()).toArray().then(String));
  expect(exported.format).toBe(1);

  expect(foreign).toEqual([]);
});
