import { offOriginRequests, ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("Settings: five pages; the name and goal sync; Data exports a file and imports it back as a dry run", async ({
  browser,
  baseURL,
}) => {
  const context = await ownerContext(browser);
  const foreign = offOriginRequests(context, baseURL as string);
  const page = await context.newPage();
  await page.goto("/settings");
  await expect(
    page.getByRole("navigation", { name: "Settings tabs" }).getByRole("link"),
  ).toHaveText(["General", "Devices & server", "Notifications", "Agents", "Data"]);

  // General: the name and the goal are settings keys, pushed as any edit.
  const pushed = (key: string) =>
    page.waitForResponse(
      (r) => r.url().endsWith("/api/sync") && (r.request().postData() ?? "").includes(key),
    );
  const name = pushed("ownerName");
  await page.getByLabel("Your name").fill("Alex");
  await page.getByLabel("Your name").blur();
  expect((await name).ok()).toBe(true);
  const goal = pushed("goal");
  await page.getByLabel("Goal").fill("Ship the Cave");
  await page.getByLabel("Goal").blur();
  expect((await goal).ok()).toBe(true);
  await expect(page.getByText("Opens on").locator("..")).toContainText("Projects → Scene");
  // The phone dock editor shows the dock's four sections with their position (buttons in rail order).
  await expect(page.getByRole("button", { pressed: true })).toHaveText([
    "2. Money",
    "4. Calendar",
    "1. Projects",
    "3. Tasks",
  ]);

  // Data: the export downloads; fed back in, it is compared first and changes nothing.
  await page.goto("/settings/data");
  await expect(
    page.getByRole("region", { name: "Collections" }).getByRole("link", { name: "Money" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download export" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^cave-\d{4}-\d{2}-\d{2}T\d{6}\.json$/);
  const body = await (await file.createReadStream()).toArray().then(String);
  expect(JSON.parse(body).format).toBe(1);

  const importPanel = page.getByRole("region", { name: "Import" });
  await importPanel
    .locator("input[type=file]")
    .setInputFiles({ name: "cave.json", mimeType: "application/json", buffer: Buffer.from(body) });
  await expect(importPanel.getByText(/0 changed, \d+ unchanged/)).toBeVisible();
  // Every doc matched this device, so there is nothing to write.
  await expect(importPanel.getByRole("button", { name: /^Import \d+ docs$/ })).toBeDisabled();
  await importPanel.getByRole("button", { name: "Cancel" }).click();
  await importPanel.locator("input[type=file]").setInputFiles({
    name: "notes.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"hello": 1}'),
  });
  await expect(importPanel.getByRole("alert")).toHaveText("Not a Cave export (format 1).");

  expect(foreign).toEqual([]);
});
