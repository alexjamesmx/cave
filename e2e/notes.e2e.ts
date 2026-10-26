import { openNew, ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("Notes: a new note with a topic, Markdown and a diagram; the gallery groups by topic, search and the table find it; a note from New lands here; Delete", async ({
  browser,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  page.on("dialog", (dialog) => void dialog.accept());
  const stamp = Date.now();
  const title = `Laptop specs ${stamp}`;
  const topic = `Tech ${stamp}`;

  await page.goto("/notes");
  await expect(page.getByRole("navigation", { name: "Notes tabs" }).getByRole("link")).toHaveText([
    "Notes",
    "Today",
    "Days",
  ]);

  // A new note: title, topic, Markdown with a diagram, drawn in the preview.
  await page.getByRole("button", { name: "New note" }).click();
  await expect(page).toHaveURL(/\/notes\/all\/[0-9A-Z]{26}$/);
  await page.getByLabel("Note title").fill(title);
  await page.getByLabel("Note title").blur();
  await page.getByLabel("Topic").fill(` ${topic} `);
  await page.getByLabel("Topic").blur();
  const body = page.getByRole("textbox", { name: "Note body" });
  await body.fill(
    "# Specs\n\n- **CPU** Ryzen 7\n\n```mermaid\nflowchart LR\n  Router --> Laptop\n```",
  );
  await body.blur();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  const preview = page.locator(".md-preview");
  await expect(preview.getByRole("heading", { name: "Specs" })).toBeVisible();
  await expect(preview.getByRole("img", { name: "Diagram" }).locator("svg")).toContainText(
    "Router",
  );
  await page.getByLabel("Colour").selectOption("teal");

  // The gallery: a group per topic, the card with the start of the text.
  await page.getByRole("link", { name: "All notes" }).click();
  await expect(page).toHaveURL(/\/notes\/all$/);
  const group = page.getByRole("region", { name: `Topic ${topic}` });
  const card = group.getByRole("link", { name: new RegExp(title) });
  await expect(card).toContainText("Specs CPU Ryzen 7 ◇ diagram");

  // Search narrows the gallery; nothing found says so.
  const search = page.getByLabel("Search notes");
  await search.fill(`ryzen`);
  await expect(card).toBeVisible();
  await search.fill(`nothing-${stamp}`);
  await expect(page.getByText(`No note matches “nothing-${stamp}”.`)).toBeVisible();
  await search.fill("");

  // The table: the same notes, grouped, one row each.
  await page
    .getByRole("navigation", { name: "Notes view" })
    .getByRole("link", { name: "Table" })
    .click();
  await expect(page).toHaveURL(/\/notes\/all\?view=table$/);
  const table = page.getByRole("table", { name: "Notes table" });
  await expect(table.getByRole("columnheader", { name: new RegExp(topic) })).toBeVisible();
  await expect(table.getByRole("link", { name: title })).toBeVisible();

  // A note from the New sheet with no project is a note here.
  await openNew(page);
  await page.getByRole("button", { name: "Note", exact: true }).click();
  const form = page.getByRole("form", { name: "Note" });
  await form.getByLabel("Title").fill(`Quick ${stamp}`);
  await form.getByRole("button", { name: "Save to Notes" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Quick ${stamp}` })).toBeVisible();
  await page.goto("/notes/all");
  const quick = page
    .getByRole("region", { name: "Topic No topic" })
    .getByRole("link", { name: new RegExp(`Quick ${stamp}`) });
  await expect(quick).toBeVisible();

  // Delete: back to the gallery, the card gone (kept in the history).
  for (const name of [`Quick ${stamp}`, title]) {
    await page.getByRole("link", { name: new RegExp(name) }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(/\/notes\/all$/);
    await expect(page.getByRole("status").filter({ hasText: `Deleted · ${name}` })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveCount(0);
  }
});
