import { expect, test } from "@playwright/test";
import { ownerContext } from "./helpers.ts";

test("an idea becomes a project; a part and a task show on its Overview and Board", async ({
  browser,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  const name = `Garden ${Date.now()}`;
  await page.goto("/projects/ideas");
  await page.getByLabel("New idea").fill(name);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const idea = page.getByRole("listitem").filter({ hasText: name });
  await idea.getByRole("button", { name: "Promote to project" }).click();
  await idea.getByLabel("Template").selectOption({ label: "Software" });
  await idea.getByRole("button", { name: "Create project" }).click();

  await expect(page).toHaveURL(/\/projects\/[0-9A-Z]{26}$/);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  const parts = page.getByRole("region", { name: "Parts" });
  await expect(parts.getByRole("listitem")).toHaveText([/Plan/, /Build/, /Ship/]);

  await parts.getByLabel("New part").fill("Beds");
  await parts.getByRole("button", { name: "Add part" }).click();
  await expect(parts.getByRole("listitem")).toHaveText([/Plan/, /Build/, /Ship/, /Beds/]);
  const add = page.getByRole("form", { name: "Add task" });
  await add.getByLabel("New task").fill("Buy seeds");
  await add.getByLabel("Task part").selectOption({ label: "Beds" });
  await add.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByRole("list", { name: "Open tasks" })).toContainText("Buy seedsBeds");

  await page
    .getByRole("navigation", { name: "Project tabs" })
    .getByRole("link", { name: "Board" })
    .click();
  await expect(page).toHaveURL(/\/board$/);
  const card = page
    .getByRole("region", { name: "todo" })
    .getByRole("button", { name: /Buy seeds/ });
  await expect(card).toBeVisible();

  // The idea now points at its project.
  await page.goto("/projects/ideas");
  await expect(idea.getByRole("link", { name: "Project" })).toBeVisible();

  // LeetCode's old link lands on its project.
  await page.goto("/c/leetcode");
  await expect(page).toHaveURL(/\/projects\/proj-leetcode\/items$/);
  await expect(page.getByRole("heading", { name: "LeetCode" })).toBeVisible();

  // Leave the shared database as found: the task goes, so the Tasks board looks the same.
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/tasks/list");
  await page.getByRole("button", { name: "Buy seeds" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("button", { name: "Buy seeds" })).toHaveCount(0);
});
