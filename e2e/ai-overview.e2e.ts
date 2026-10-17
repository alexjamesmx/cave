import { expect, test } from "@playwright/test";
import { ownerContext } from "./helpers.ts";

test("AI → Overview draws the setup in four columns, with counts, and a node opens where it lives", async ({
  browser,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  await page.goto("/ai/overview");
  const counts = page.getByRole("region", { name: "AI setup" });
  for (const label of [
    "rules",
    "skills",
    "plugins",
    "MCP servers",
    "agents",
    "flows on",
    "runs today",
  ])
    await expect(counts.getByText(label, { exact: true })).toBeVisible();

  const map = page.getByRole("region", { name: "AI setup map" });
  for (const heading of [
    "Where AI is used",
    "What connects it",
    "The Cave's tools",
    "What runs on its own",
  ])
    await expect(map.getByText(heading, { exact: true })).toBeVisible();
  await expect(map.locator(".react-flow__node", { hasText: "Cave MCP" })).toBeVisible();
  await expect(map.locator(".react-flow__node", { hasText: "Cave Ask" })).toBeVisible();

  // A seeded flow sits under automations; clicking it opens it on the Flows page.
  const flow = map.locator(".react-flow__node", { hasText: "Rent reminder" });
  await expect(flow).toBeVisible();
  await flow.click();
  await expect(page).toHaveURL(/\/ai\/flows\/flow-rent$/);
});
