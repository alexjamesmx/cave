import { mcpClient, ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("agent findings rank into For you with chips; Save offline makes one inert Inbox note", async ({
  browser,
  baseURL,
}) => {
  const tag = Date.now();
  const client = await mcpClient(baseURL as string, "radar-e2e");
  const add = (title: string, url: string, extra: Record<string, unknown> = {}, body?: string) =>
    client.callTool({
      name: "create",
      arguments: {
        collection: "radar",
        title,
        fields: { url, why: "Worth a look", source: "e2e", ...extra },
        ...(body ? { body } : {}),
      },
    }) as Promise<{ isError?: boolean; content: { text: string }[] }>;
  const llm = `LLM agents ${tag}`;
  const crypto = `Weekly ${tag}`;
  const garden = `Garden beds ${tag}`;
  for (const result of [
    await add(
      llm,
      `https://example.com/llm-${tag}`,
      {},
      `Read <img src=x onerror="document.title='owned'">`,
    ),
    await add(crypto, `https://example.com/w-${tag}`, { interests: "Crypto" }),
    await add(garden, `https://example.com/g-${tag}`),
  ])
    expect(result.isError).toBeUndefined();
  const again = await add(llm, `https://example.com/llm-${tag}/`);
  expect(again.isError).toBe(true);
  expect(again.content[0]?.text).toContain("already on the radar");
  await client.close();

  const context = await ownerContext(browser, { viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();
  await page.goto("/projects/radar");
  const findings = page.getByRole("list", { name: "Findings" });
  await expect(async () => {
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(findings).toContainText(llm, { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(findings.getByRole("listitem", { name: llm })).toContainText("AI");
  await expect(findings.getByRole("listitem", { name: crypto })).toContainText("Crypto");
  await expect(findings).not.toContainText(garden);
  await page.getByRole("button", { name: /^All/ }).click();
  await expect(findings).toContainText(garden);
  await findings
    .getByRole("listitem", { name: garden })
    .getByRole("button", { name: "Dismiss" })
    .click();
  await expect(findings).not.toContainText(garden);

  await context.setOffline(true);
  await page.getByRole("button", { name: /^For you/ }).click();
  await findings.getByRole("listitem", { name: llm }).getByRole("button", { name: "Save" }).click();
  await expect(findings).not.toContainText(llm);
  await page.getByRole("button", { name: /^Saved/ }).click();
  await findings
    .getByRole("listitem", { name: llm })
    .getByRole("link", { name: "Open note" })
    .click();
  const note = page.getByRole("article", { name: `Note ${llm}` });
  await expect(note.getByLabel("Folder")).toHaveValue("Inbox");
  await expect(note.locator(".markdown")).toContainText("<img src=x onerror=");
  await expect(note.locator(".markdown")).toContainText("My take");
  await expect(note.locator(".markdown img")).toHaveCount(0);
  expect(await page.title()).not.toBe("owned");
  await context.setOffline(false);
  await page.goto("/");
  const card = page.getByRole("region", { name: "Radar" });
  await expect(card).toContainText(crypto);
  await expect(card).not.toContainText(llm);
});
