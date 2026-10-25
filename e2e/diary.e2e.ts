import { ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("Notes → Days: a day opened from the grid is written in the editor, coloured, ticked; the grid shows the tint, dot and pip; a new habit joins the streaks", async ({
  browser,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/diary");
  await expect(page).toHaveURL(/\/notes\/write$/);
  await expect(page.getByRole("navigation", { name: "Notes tabs" }).getByRole("link")).toHaveText([
    "Notes",
    "Today",
    "Days",
  ]);
  await page.goto("/diary/months");
  await expect(page).toHaveURL(/\/notes\/days$/);

  // Open today from the grid.
  const grid = page.getByRole("region", { name: "Days" });
  const today = grid.locator("a.today");
  const day = (await today.getAttribute("href"))?.split("day=")[1] ?? "";
  expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await today.click();
  await expect(page).toHaveURL(new RegExp(`/notes/days\\?day=${day}$`));
  const panel = page.getByRole("region", { name: `Day ${day}` });

  // Write with the editor (Markdown, previewed), pick a colour, tick a habit.
  const text = `Days e2e ${Date.now()}`;
  await panel.getByLabel("Diary entry").fill(`# ${text}\n\n**bold** day`);
  await panel.getByLabel("Diary entry").blur();
  await expect(panel.locator(".md-preview").getByRole("heading", { name: text })).toBeVisible();
  await panel.getByLabel("Day colour").selectOption("teal");
  const habit = panel
    .getByRole("group", { name: "Habits" })
    .locator("button.chip[aria-pressed=false]")
    .first();
  const name = (await habit.textContent()) ?? "";
  await habit.click();
  await expect(panel.getByRole("button", { name, exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // The grid: a dot, a pip and the tint on the day.
  await expect(today).toHaveAttribute("aria-label", /, written, \d+ habits?$/);
  await expect(today.locator(".entry-dot")).toBeVisible();
  await expect(today.locator(".habit-pip.on")).toHaveCount(1);
  await expect(today).toHaveAttribute("data-color", "teal");

  // Today shows the same entry.
  await page.goto("/notes/write");
  await expect(page.getByLabel("Diary entry")).toHaveValue(`# ${text}\n\n**bold** day`);

  // Delete removes the entry (kept in the history); the grid loses its dot.
  await page.goto(`/notes/days?day=${day}`);
  await panel.getByRole("button", { name: "Delete entry" }).click();
  await expect(today.locator(".entry-dot")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Delete entry" })).toHaveCount(0);

  // A new habit joins the streak list.
  await page.getByRole("button", { name: "Close day" }).click();
  await expect(page).toHaveURL(/\/notes\/days$/);
  const habits = page.getByRole("region", { name: "Habits" });
  const fresh = `Habit ${Date.now()}`;
  await habits.getByLabel("New habit").fill(fresh);
  await habits.getByRole("button", { name: "Add habit" }).click();
  await expect(habits).toContainText(fresh);
  await expect(habits).toContainText("0/30 · 0d");
});
