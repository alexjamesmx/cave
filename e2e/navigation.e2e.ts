import { ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("the sidebar shows five sections and Settings once; a tab survives a reload; old links land in place", async ({
  browser,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  await page.goto("/");
  const main = page.getByRole("navigation", { name: "Main" });
  await expect(main.getByRole("link")).toHaveText([
    "Money",
    "Tasks",
    "Calendar",
    "Notes",
    "Flows",
    "Settings",
  ]);

  // The sidebar opens wide with names; Hide names narrows it to tiles, the choice survives a
  // reload, and Show names undoes it.
  const side = page.locator(".side");
  await expect(main.getByText("Money", { exact: true })).toBeVisible();
  const wide = (await side.boundingBox())?.width ?? 0;
  await page.getByRole("button", { name: "Hide names" }).click();
  expect((await side.boundingBox())?.width ?? 0).toBeLessThan(wide - 100);
  await page.reload();
  await expect(page.getByRole("button", { name: "Show names" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect((await side.boundingBox())?.width ?? 0).toBeLessThan(wide - 100);
  await page.getByRole("button", { name: "Show names" }).click();
  await expect(main.getByText("Money", { exact: true })).toBeVisible();
  expect((await side.boundingBox())?.width ?? 0).toBeGreaterThan(wide - 10);

  await main.getByRole("link", { name: "Money" }).click();
  const tabs = page.getByRole("navigation", { name: "Money tabs" });
  await tabs.getByRole("link", { name: "Subscriptions" }).click();
  await expect(page).toHaveURL(/\/money\/subscriptions$/);
  await page.reload();
  await expect(tabs.getByRole("link", { name: "Subscriptions" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("table", { name: "Subscriptions" })).toBeVisible();

  for (const [from, to] of [
    ["/", /\/money\/overview$/],
    ["/c/journal", /\/notes\/write$/],
    ["/life/habits", /\/notes\/days$/],
    ["/projects/notes", /\/notes\/all$/],
    ["/agents", /\/settings\/agents$/],
    ["/settings/flows/flow-rent", /\/flows\/flow-rent$/],
    ["/ai/flows/flow-salary", /\/flows\/flow-salary$/],
    ["/ai/activity", /\/money\/overview$/],
    ["/projects/ideas", /\/notes\/all\?topic=Ideas$/],
    ["/ideas/leetcode", /\/notes\/leetcode$/],
    ["/calendar/reminders", /\/calendar\/agenda$/],
    ["/system/jobs", /\/settings\/devices\/jobs$/],
    ["/settings/system/flows", /\/flows$/],
    ["/settings/lists", /\/money\/lists$/],
    ["/c/proposals", /\/settings\/data\/proposals$/],
  ] as const) {
    await page.goto(from);
    await expect(page).toHaveURL(to);
  }
});
