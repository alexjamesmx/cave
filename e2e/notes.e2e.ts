import { mcpClient, openNew, ownerContext, pushed } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("Notes: a new note written in one pane (Markdown shortcuts, a / checklist ticked with a click, a diagram); the topic filters the cards; / searches; a note from New lands in Inbox; Delete", async ({
  browser,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  page.on("dialog", (dialog) => void dialog.accept());
  const stamp = Date.now();
  const title = `Laptop specs ${stamp}`;
  const topic = `Tech ${stamp}`;
  const topics = page.getByRole("navigation", { name: "Topics" });
  const cards = page.getByRole("region", { name: "Notes", exact: true });
  const bar = page.getByLabel("Capture or search");

  await page.goto("/notes");
  await expect(page.getByRole("navigation", { name: "Notes tabs" }).getByRole("link")).toHaveText([
    "Notes",
    "Today",
    "Days",
  ]);

  // A new note: title, topic, then the text in one pane, formatted as it is typed.
  await page.getByRole("button", { name: "New note" }).click();
  await expect(page).toHaveURL(/\/notes\/all\/[0-9A-Z]{26}$/);
  await page.getByLabel("Note title").fill(title);
  await page.getByLabel("Note title").blur();
  await page.getByLabel("Topic").fill(` ${topic} `);
  await page.getByLabel("Topic").blur();
  const body = page.getByRole("textbox", { name: "Note body" });
  await body.click();
  await page.keyboard.type("# Specs\n- **CPU** Ryzen 7\n\n");
  await expect(body.getByRole("heading", { name: "Specs" })).toBeVisible();
  await expect(body.locator("li strong")).toHaveText("CPU");
  // The / menu makes a checklist; a box is ticked with a click.
  await page.keyboard.type("/che");
  await page.getByRole("listbox", { name: "Blocks" }).getByRole("option", { name: /Checklist/ });
  await page.keyboard.press("Enter");
  await page.keyboard.type("Buy a dock\nCheck the warranty\n\n");
  await body.getByRole("checkbox", { name: /Buy a dock/ }).click();
  await expect(body.getByRole("checkbox", { name: /Buy a dock/ })).toBeChecked();
  // A mermaid block is drawn under its source.
  await page.keyboard.type("```mermaid\nflowchart LR\n  Router --> Laptop");
  await expect(body.getByRole("img", { name: "Diagram" }).locator("svg")).toContainText("Router");
  await body.blur();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await page.getByLabel("Colour", { exact: true }).selectOption("teal");

  // Back to the cards; the topic is in the sidebar and filters to its notes.
  await page.getByRole("link", { name: "Back to notes" }).click();
  await expect(page).toHaveURL(/\/notes\/all$/);
  const tech = topics.getByRole("link", { name: new RegExp(`^${topic}`) });
  await expect(tech.locator(".notes-topic-count")).toHaveText("1");
  await tech.click();
  await expect(tech).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveURL(new RegExp(`/notes/all\\?topic=Tech(%20|\\+)${stamp}$`));
  const card = cards.getByRole("link", { name: new RegExp(title) });
  await expect(card).toContainText("Specs · CPU Ryzen 7 ◇ diagram");
  await expect(card).toContainText(topic);
  // The card lists the checklist and how far along it is.
  await expect(card.getByRole("listitem")).toHaveText([
    /Done: Buy a dock$/,
    /To do: Check the warranty$/,
  ]);
  await expect(card.locator(".note-card-progress")).toHaveText("✓ 1/2");
  await expect(cards.getByRole("link")).toHaveCount(1);

  // / focuses the bar as a search; nothing found says so; Escape clears it.
  await page.keyboard.press("/");
  await expect(bar).toBeFocused();
  await expect(bar).toHaveValue("/");
  await page.keyboard.type("ryzen");
  await expect(card).toBeVisible();
  await bar.fill(`/nothing-${stamp}`);
  await expect(page.getByText(`No note matches “nothing-${stamp}”.`)).toBeVisible();
  await bar.press("Enter");
  await expect(bar).toHaveValue(`/nothing-${stamp}`);
  await bar.press("Escape");
  await expect(bar).toHaveValue("");
  await expect(card).toBeVisible();

  // The capture bar: Enter saves a note in the open topic, the first line its title.
  await bar.fill(`Router ${stamp}\nPort 8080, admin page`);
  await bar.press("Enter");
  await expect(bar).toHaveValue("");
  const router = cards.getByRole("link", { name: new RegExp(`Router ${stamp}`) });
  await expect(router).toContainText("Port 8080, admin page");
  await expect(router).toContainText(topic);
  await router.click();
  await expect(page).toHaveURL(/\/notes\/all\/[0-9A-Z]{26}\?topic=/);
  await expect(page.getByLabel("Note title")).toHaveValue(`Router ${stamp}`);
  await expect(page.getByLabel("Topic")).toHaveValue(topic);
  await expect(page.getByRole("textbox", { name: "Note body" })).toHaveText(
    "Port 8080, admin page",
  );
  // The way back keeps the topic.
  await page.getByRole("link", { name: "Back to notes" }).click();
  await expect(page).toHaveURL(/\/notes\/all\?topic=/);

  // A note from the New sheet has no topic: it is in Inbox.
  await openNew(page);
  await page.getByRole("button", { name: "Note", exact: true }).click();
  const form = page.getByRole("form", { name: "Note" });
  await form.getByLabel("Title").fill(`Quick ${stamp}`);
  await form.getByLabel("Text").fill("Two lines\nof text");
  await form.getByRole("button", { name: "Save to Notes" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Quick ${stamp}` })).toBeVisible();
  await page.goto("/notes/all");
  await topics.getByRole("link", { name: /^Inbox/ }).click();
  await expect(page).toHaveURL(/\/notes\/all\?topic=Inbox$/);
  await expect(cards.getByRole("link", { name: new RegExp(`Quick ${stamp}`) })).toContainText(
    "Two lines of text",
  );
  await expect(cards.getByRole("link", { name: new RegExp(title) })).toHaveCount(0);

  // Delete: back to the cards, the card gone (kept in the history).
  await page.goto("/notes/all");
  for (const name of [`Quick ${stamp}`, `Router ${stamp}`, title]) {
    await cards.getByRole("link", { name: new RegExp(name) }).click();
    await pushed(page, () => page.getByRole("button", { name: "Delete" }).click());
    await expect(page).toHaveURL(/\/notes\/all$/);
    await expect(page.getByRole("status").filter({ hasText: `Deleted · ${name}` })).toBeVisible();
    await expect(cards.getByRole("link", { name: new RegExp(name) })).toHaveCount(0);
  }
  await expect(topics.getByRole("link", { name: new RegExp(topic) })).toHaveCount(0);
});

test("Ideas are the topic Ideas: old links land there, an idea is captured into it; on a phone the topics are pills with no sideways scroll", async ({
  browser,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 390, height: 844 } })
  ).newPage();
  page.on("dialog", (dialog) => void dialog.accept());
  const idea = `Balcony herbs ${Date.now()}`;
  const topics = page.getByRole("navigation", { name: "Topics" });
  const cards = page.getByRole("region", { name: "Notes", exact: true });

  for (const old of ["/ideas", "/notes/ideas", "/projects/ideas"]) {
    await page.goto(old);
    await expect(page).toHaveURL(/\/notes\/all\?topic=Ideas$/);
  }
  const ideas = topics.getByRole("link", { name: /^Ideas/ });
  await expect(ideas).toHaveAttribute("aria-current", "page");
  const count = ideas.locator(".notes-topic-count");
  const before = Number(await count.textContent());

  const bar = page.getByLabel("Capture or search");
  await bar.fill(idea);
  await bar.press("Enter");
  const card = cards.getByRole("link", { name: new RegExp(idea) });
  await expect(card).toContainText("Ideas");
  await expect(count).toHaveText(String(before + 1));

  // The page never scrolls sideways; the topics row scrolls on its own.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(topics).toHaveCSS("overflow-x", "auto");

  await card.click();
  await pushed(page, () => page.getByRole("button", { name: "Delete" }).click());
  await expect(page).toHaveURL(/\/notes\/all\?topic=Ideas$/);
  await expect(card).toHaveCount(0);
});

test("a note keeps its Markdown until the owner edits it; an agent's change under an unsaved edit asks first", async ({
  browser,
  baseURL,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  page.on("dialog", (dialog) => void dialog.accept());
  const agent = await mcpClient(baseURL as string, "notes-e2e");
  const body = async (id: string) => {
    const got = await agent.callTool({ name: "get", arguments: { id } });
    return (got.structuredContent as { body?: string }).body;
  };
  const title = `Kept ${Date.now()}`;
  // Written the way the editor would not write it: `_` emphasis, a table not lined up.
  const written = "_tidy_ notes & more\n\n| a | b |\n|---|---|\n| 1 | 2 |";
  const made = await agent.callTool({ name: "add_note", arguments: { title, body: written } });
  const id = (made.structuredContent as { id: string }).id;
  // A device picks up what agents wrote when it syncs; `online` starts one now.
  const sync = () => page.evaluate(() => window.dispatchEvent(new Event("online")));

  await page.goto(`/notes/all/${id}`);
  await sync();
  const text = page.getByRole("textbox", { name: "Note body" });
  await expect(text.locator("em")).toHaveText("tidy");
  await expect(text.getByRole("table")).toBeVisible();
  // Opened, looked at, left: nothing is written.
  await text.click();
  await text.blur();
  await page.waitForTimeout(2500);
  await page.getByRole("link", { name: "Back to notes" }).click();
  expect(await body(id)).toBe(written);

  // An unsaved edit, then the agent changes the note: the page asks; Keep mine writes the edit.
  await page.goto(`/notes/all/${id}`);
  await text.locator("p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" mine");
  const changed = await agent.callTool({
    name: "update",
    arguments: { id, body: "From the agent" },
  });
  expect(changed.isError).toBeFalsy();
  await sync();
  await expect(page.getByRole("alert")).toContainText("Changed elsewhere while you were editing.");
  await page.getByRole("button", { name: "Keep mine" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect
    .poll(() => body(id))
    .toBe("*tidy* notes & more mine\n\n| a   | b   |\n| --- | --- |\n| 1   | 2   |");

  await pushed(page, () => page.getByRole("button", { name: "Delete" }).click());
  await agent.close();
});
