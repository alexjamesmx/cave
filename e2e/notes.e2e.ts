import { mcpClient, ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("a note written offline with a wikilink renders on a second device after sync, and search finds it", async ({
  browser,
}) => {
  const tag = Date.now();
  const a = `Wiki A ${tag}`;
  const b = `Wiki B ${tag}`;
  const phone = await ownerContext(browser, { viewport: { width: 1360, height: 900 } });
  const page = await phone.newPage();
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/projects/notes");
  await expect(page.getByRole("complementary", { name: "Notes" })).toBeVisible();

  // Offline: write the note, then follow its link to a note that doesn't exist yet.
  await phone.setOffline(true);
  await page.getByLabel("New note").fill(a);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const note = page.getByRole("article", { name: `Note ${a}` });
  await note.getByRole("button", { name: "Edit" }).click();
  await note.getByLabel("Note text").fill(`Plan for the trip. See [[${b}]].\n\n- [ ] book`);
  await note.getByRole("button", { name: "Done" }).click();
  await expect(note.locator(".markdown")).toContainText("Plan for the trip.");
  await note.getByRole("button", { name: b }).click();
  await expect(page.getByRole("article", { name: `Note ${b}` })).toBeVisible();

  // Back online: the second device gets both.
  await phone.setOffline(false);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const laptop = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  await laptop.goto("/projects/notes");
  const search = laptop.getByLabel("Search notes");
  await expect(async () => {
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await laptop.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await search.fill("");
    await search.fill(`plan for the trip`);
    await expect(laptop.getByRole("list", { name: "Search results" })).toContainText(a, {
      timeout: 1000,
    });
  }).toPass({ timeout: 20_000 });
  await laptop.getByRole("list", { name: "Search results" }).getByText(a, { exact: true }).click();
  const shown = laptop.getByRole("article", { name: `Note ${a}` });
  await expect(shown.locator("a.wikilink", { hasText: b })).toBeVisible();
  await expect(shown.locator('input[type="checkbox"]')).toHaveCount(1);
  await expect(shown.getByRole("region", { name: "Links" })).toContainText(b);
  await shown.locator("a.wikilink", { hasText: b }).click();
  await expect(
    laptop.getByRole("article", { name: `Note ${b}` }).getByRole("region", { name: "Linked from" }),
  ).toContainText(a);
});

test("an agent's note holding HTML shows it as text: no element, no CSP violation", async ({
  browser,
  baseURL,
}) => {
  const client = await mcpClient(baseURL as string, "notes-e2e");
  const title = `Agent note ${Date.now()}`;
  await client.callTool({
    name: "add_note",
    arguments: {
      title,
      body: `Look: <img src=x onerror="document.title='owned'"> and <script>alert(1)</script>`,
    },
  });
  await client.close();

  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  await page.goto("/projects/notes?folder=Inbox");
  const list = page.getByRole("list", { name: "Notes in folder" });
  await expect(async () => {
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(list).toContainText(title, { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await list.getByText(title, { exact: true }).click();
  const note = page.getByRole("article", { name: `Note ${title}` });
  await expect(note.locator(".markdown")).toContainText("<img src=x onerror=");
  await expect(note.locator(".markdown img, .markdown script")).toHaveCount(0);
  expect(await page.title()).not.toBe("owned");
});

test("N on Home opens a quick note; it lands in the Inbox and on Recent notes", async ({
  browser,
}) => {
  const page = await (await ownerContext(browser)).newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What's the move?" })).toBeVisible();
  // The shortcut ignores keys typed into a field, so nothing may have focus.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("n");
  const form = page.getByRole("form", { name: "Note" });
  const title = `Quick note ${Date.now()}`;
  await form.getByLabel("Title").fill(title);
  await form.getByLabel("Text").fill("From the keyboard.");
  await form.getByRole("button", { name: "Save to Inbox" }).click();
  await expect(page.getByRole("article", { name: `Note ${title}` })).toBeVisible();
  await expect(
    page.getByRole("article", { name: `Note ${title}` }).getByLabel("Folder"),
  ).toHaveValue("Inbox");
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Recent notes" })).toContainText(title);
});
