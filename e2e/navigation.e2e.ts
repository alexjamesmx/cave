import { ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("the sidebar shows each of the seven sections once; a tab survives a reload; old links land in place", async ({
  browser,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  await page.goto("/");
  const main = page.getByRole("navigation", { name: "Main" });
  await expect(main.getByRole("link")).toHaveText([
    "Home",
    "Money",
    "Calendar",
    "Tasks",
    "Projects",
    "Life",
    "Settings",
  ]);

  await main.getByRole("link", { name: "Money" }).click();
  const tabs = page.getByRole("navigation", { name: "Money tabs" });
  await tabs.getByRole("link", { name: "Payments" }).click();
  await expect(page).toHaveURL(/\/money\/payments$/);
  await page.reload();
  await expect(tabs.getByRole("link", { name: "Payments" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("region", { name: "Payments by due date" })).toBeVisible();

  for (const [from, to] of [
    ["/c/journal", /\/life\/diary$/],
    ["/agents", /\/settings\/agents$/],
    ["/ai/flows/flow-salary", /\/settings\/flows\/flow-salary$/],
    ["/ai/activity", /\/projects\/activity$/],
    ["/system/jobs", /\/settings\/system\/jobs$/],
    ["/c/proposals", /\/settings\/data\/proposals$/],
  ] as const) {
    await page.goto(from);
    await expect(page).toHaveURL(to);
  }
});
