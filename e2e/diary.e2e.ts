import { ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("Notes → Days: a day opened from the grid reads as Markdown, Edit writes it, colours it, ticks a habit; the grid shows the tint, dot and pip; a new habit joins the streaks", async ({
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
  const panel = page.getByRole("dialog", { name: `Day ${day}` });

  // It opens to read; Edit swaps in the editor (Markdown, previewed), a colour, the habits.
  await expect(panel.getByLabel("Diary entry")).toHaveCount(0);
  await panel.getByRole("button", { name: "Edit", exact: true }).click();
  const text = `Days e2e ${Date.now()}`;
  await panel.getByLabel("Diary entry").fill(`# ${text}\n\n**bold** day`);
  await panel.getByLabel("Diary entry").blur();
  await expect(panel.locator(".md-preview").getByRole("heading", { name: text })).toBeVisible();
  // The preview can be hidden, and comes back.
  await panel.getByRole("button", { name: "Preview" }).click();
  await expect(panel.locator(".md-preview")).toHaveCount(0);
  await panel.getByRole("button", { name: "Preview" }).click();
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

  // Read shows the rendered entry and the habit done.
  await panel.getByRole("button", { name: "Read", exact: true }).click();
  await expect(panel.getByRole("article").getByRole("heading", { name: text })).toBeVisible();
  await expect(panel.getByRole("region", { name: "Habits done" })).toContainText("1 of");

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
  await panel.getByRole("button", { name: "Edit", exact: true }).click();
  await panel.getByRole("button", { name: "Delete entry" }).click();
  await expect(today.locator(".entry-dot")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Delete entry" })).toHaveCount(0);

  // A new habit joins the streak list.
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(page).toHaveURL(/\/notes\/days$/);
  const habits = page.getByRole("region", { name: "Habits" });
  const fresh = `Habit ${Date.now()}`;
  await habits.getByLabel("New habit").fill(fresh);
  await habits.getByRole("button", { name: "Add habit" }).click();
  await expect(habits).toContainText(fresh);
  await expect(habits).toContainText("0/30 · 0d");

  // Edit habits: rename it, archive it (it leaves the streaks), restore it, then archive it
  // again so the shared diary looks as found.
  await habits.getByRole("button", { name: "Edit habits" }).click();
  await habits.getByLabel(`Name of ${fresh}`).fill(`${fresh} renamed`);
  await habits.getByLabel(`Name of ${fresh}`).blur();
  await expect(habits.getByLabel(`Name of ${fresh} renamed`)).toBeVisible();
  await habits.getByRole("button", { name: `Archive ${fresh} renamed` }).click();
  await expect(habits.getByRole("list", { name: "Archived habits" })).toContainText(
    `${fresh} renamed`,
  );
  await habits.getByRole("button", { name: `Restore ${fresh} renamed` }).click();
  await expect(habits.getByLabel(`Name of ${fresh} renamed`)).toBeVisible();
  await habits.getByRole("button", { name: `Archive ${fresh} renamed` }).click();
  await habits.getByRole("button", { name: "Done" }).click();
  await expect(habits).not.toContainText(fresh);

  // Text colour and highlight from the toolbar, shown in the preview.
  await page.goto("/notes/write");
  const entry = page.getByLabel("Diary entry");
  await entry.fill("late bill");
  await entry.selectText();
  await page.getByRole("button", { name: "Text colour" }).click();
  await page.getByRole("button", { name: "red", exact: true }).click();
  await expect(entry).toHaveValue(":red[late bill]");
  await expect(page.locator(".md-preview .md-color")).toHaveText("late bill");
  await entry.fill("==mark==");
  await expect(page.locator(".md-preview mark")).toHaveText("mark");
  await entry.fill("");
  await entry.blur();
});
