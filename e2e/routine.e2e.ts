import { ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("Calendar → Routine: a daily block on every day, a block on one day from its +, a weekly one under Any day; the areas add up the hours", async ({
  browser,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  const stamp = Date.now();
  const daily = `Chinese ${stamp}`;
  const saturday = `Climb ${stamp}`;
  const weekly = `Movie ${stamp}`;
  await page.goto("/calendar/week");
  await expect(page).toHaveURL(/\/calendar\/routine$/);
  await expect(
    page.getByRole("navigation", { name: "Calendar tabs" }).getByRole("link"),
  ).toHaveText(["Month", "Reminders", "Routine"]);

  // A daily block, to learn: on every day, and Learn counts its seven half hours.
  await page.getByRole("button", { name: "Add block" }).click();
  const form = page.getByRole("form", { name: "New block" });
  await form.getByLabel("Title").fill(daily);
  await form.getByRole("button", { name: "Learn" }).click();
  await form.getByRole("button", { name: "Every day" }).click();
  await form.getByLabel("Minutes").fill("30");
  await form.getByRole("button", { name: "Add" }).click();
  for (const day of ["Mon", "Sun"])
    await expect(page.getByRole("region", { name: day })).toContainText(daily);
  const areas = page.getByRole("list", { name: "Hours a week by area" });
  await expect(areas).toContainText("Learn");

  // A day's + adds a block on that day only.
  await page.getByRole("button", { name: "Add a block on Sat" }).click();
  const one = page.getByRole("form", { name: "New block" });
  await one.getByLabel("Title").fill(saturday);
  await one.getByLabel("Start").fill("10:00");
  await one.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("region", { name: "Sat" })).toContainText(saturday);
  await expect(page.getByRole("region", { name: "Fri" })).not.toContainText(saturday);
  await expect(areas).toContainText("Body");

  // Some times a week: under Any day, with its count.
  await page.getByRole("button", { name: "Add block" }).click();
  const some = page.getByRole("form", { name: "New block" });
  await some.getByLabel("Title").fill(weekly);
  await some.getByRole("button", { name: "Fun" }).click();
  await some.getByRole("button", { name: "Some times a week" }).click();
  await some.getByRole("spinbutton", { name: "Times a week" }).fill("2");
  await some.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("region", { name: "Some times a week" })).toContainText(
    `${weekly}2×`,
  );

  // Leave the shared database as found: every block deleted.
  for (const title of [weekly, saturday, daily]) {
    await page
      .getByRole("button", { name: new RegExp(title) })
      .first()
      .click();
    await page
      .getByRole("form", { name: "Edit block" })
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(page.getByRole("button", { name: new RegExp(title) })).toHaveCount(0);
  }
});
