import { ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("Calendar → Week: a daily and a weekly block, the weekly one tracked as a habit, ticked from Agenda, counted on Week", async ({
  browser,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  const stamp = Date.now();
  const daily = `Chinese ${stamp}`;
  const weekly = `Gym ${stamp}`;
  await page.goto("/calendar/week");
  await expect(
    page.getByRole("navigation", { name: "Calendar tabs" }).getByRole("link", { name: "Week" }),
  ).toHaveAttribute("aria-current", "page");

  // A daily block shows on every day, with the free time under it.
  await page.getByRole("button", { name: "Add block" }).click();
  const form = page.getByRole("form", { name: "New block" });
  await form.getByLabel("Title").fill(daily);
  await form.getByLabel("Minutes").fill("30");
  await form.getByRole("button", { name: "Add" }).click();
  for (const day of ["Mon", "Sun"])
    await expect(page.getByRole("region", { name: day })).toContainText(daily);

  // A weekly block, tracked as a new diary habit, sits in the This week pool with its counter.
  await page.getByRole("button", { name: "Add block" }).click();
  const second = page.getByRole("form", { name: "New block" });
  await second.getByLabel("Title").fill(weekly);
  await second.getByLabel("Kind").selectOption("weekly");
  await second.getByRole("spinbutton", { name: "Times a week" }).fill("2");
  await second.getByRole("button", { name: "Track as a habit" }).click();
  const pool = page.getByRole("region", { name: "This week" });
  await expect(pool.getByRole("button", { name: `${weekly} · 0 of 2` })).toBeVisible();

  // The daily block is a habit too, so Agenda can tick it; ticking the weekly one's habit in the
  // Diary moves the counter.
  await page
    .getByRole("button", { name: new RegExp(daily) })
    .first()
    .click();
  const edit = page.getByRole("form", { name: "Edit block" });
  await edit.getByRole("button", { name: "Track as a habit" }).click();
  // The habit is linked once the button goes; leaving earlier could cut the write off.
  await expect(edit.getByRole("button", { name: "Track as a habit" })).toHaveCount(0);
  await page.goto("/calendar/agenda");
  const today = page.getByRole("region", { name: "Agenda" }).getByRole("list", { name: "Today" });
  await expect(today).toContainText(daily);
  await today.getByRole("button", { name: `${daily} done` }).click();
  await expect(today.getByRole("button", { name: `${daily} done` })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.goto("/notes/write");
  await page.getByRole("button", { name: weekly, exact: true }).click();
  await expect(page.getByRole("button", { name: weekly, exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.goto("/calendar/week");
  await expect(pool.getByRole("button", { name: `${weekly} · 1 of 2` })).toBeVisible();

  // Leave the shared database as found: both blocks deleted, today's ticks undone.
  for (const title of [weekly, daily]) {
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
  await page.goto("/notes/write");
  for (const title of [weekly, daily]) {
    const chip = page.getByRole("button", { name: title, exact: true });
    if ((await chip.getAttribute("aria-pressed")) === "true") await chip.click();
  }
});
