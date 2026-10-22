import { spawnSync } from "node:child_process";
import { addMoney, E2E_TOKEN, ownerContext, syncBadge } from "./helpers.ts";
import { expect, type Page, test } from "./test.ts";

/** `bun run money-review --local` against the e2e server, as the owner runs it on the laptop. */
function runReview(baseURL: string): string {
  const result = spawnSync("bun", ["run", "server/cli/money-review.ts", "--local"], {
    env: { ...process.env, PORT: new URL(baseURL).port, CAVE_TOKEN: E2E_TOKEN },
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout;
}

const categoryIn = async (page: Page, title: string) => {
  await page.goto("/c/money/table");
  return page.getByRole("row").filter({ hasText: title }).first();
};

test("an expense on another day, emoji categories by direction, and a review that changes nothing until approved", async ({
  browser,
  baseURL,
}) => {
  const context = await ownerContext(browser);
  const page = await context.newPage();
  await page.goto("/");

  // Income shows income categories only.
  await page.getByRole("button", { name: "Expense" }).first().click();
  const form = page.getByRole("form", { name: /Expense|Income/ });
  await expect(form.getByRole("button", { name: "🍬 Gula" })).toBeVisible();
  await form.getByRole("button", { name: "Income", exact: true }).click();
  await expect(form.getByRole("button", { name: "💼 Salary" })).toBeVisible();
  await expect(form.getByRole("button", { name: "🍬 Gula" })).toHaveCount(0);
  await page.getByRole("button", { name: "Expense" }).first().click();

  await addMoney(page, { amount: 410, title: "Mezcal review", category: "Other", yesterday: true });
  await expect(
    page.getByRole("status").filter({ hasText: "Saved · Expense · Mezcal review" }),
  ).toBeVisible();
  // The review reads the server, so wait until this entry has reached it.
  const synced = page.waitForResponse(
    (r) => r.url().endsWith("/api/sync") && (r.request().postData() ?? "").includes("Gula review"),
  );
  await addMoney(page, { amount: 60, title: "Gula review" });
  expect((await synced).ok()).toBe(true);
  await expect(syncBadge(page)).toHaveText("SYNCED");

  const yesterday = await page.evaluate(() => {
    const d = new Date(Date.now() - 86_400_000);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  });
  const mezcal = await categoryIn(page, "Mezcal review");
  await expect(mezcal).toContainText("❓ Other");
  await expect(mezcal).toContainText(yesterday);

  const out = runReview(baseURL as string);
  expect(out).toContain("proposals");
  // Built and stored, but no entry changed.
  await expect(await categoryIn(page, "Mezcal review")).toContainText("❓ Other");

  await page.goto("/money/review");
  const toNone = page.getByRole("region", { name: "❓ Other to Uncategorized" });
  await expect(toNone.getByText("Mezcal review")).toBeVisible();
  const toGula = page.getByRole("region", { name: "Uncategorized to 🍬 Gula" });
  await expect(toGula.getByText("Gula review")).toBeVisible();

  // An approved group leaves the page.
  await toNone.getByRole("button", { name: "Approve group" }).click();
  await expect(toNone).toHaveCount(0);
  await toGula.getByRole("button", { name: "Approve group" }).click();
  await expect(toGula).toHaveCount(0);
  await expect(await categoryIn(page, "Gula review")).toContainText("🍬 Gula");
  await expect(await categoryIn(page, "Mezcal review")).not.toContainText("Other");

  // One Undo reverses the last approval.
  await page.goto("/money/review");
  await page.getByRole("button", { name: "Undo last approval" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Undone" })).toBeVisible();
  await expect(await categoryIn(page, "Gula review")).not.toContainText("🍬 Gula");

  // A second review skips what stays decided and asks again about what was undone.
  expect(runReview(baseURL as string)).toMatch(/Stored \d+ for review \(\d+ already decided\)/);
  await page.goto("/money/review");
  await expect(page.getByText("Mezcal review")).toHaveCount(0);
  await expect(page.getByText("Gula review")).toBeVisible();
});
