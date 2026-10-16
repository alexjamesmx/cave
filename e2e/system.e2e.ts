import { expect, test } from "@playwright/test";
import { offOriginRequests } from "./helpers.ts";

test("/system renders each tab with a flow, a reminder and a job run", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext();
  const foreign = offOriginRequests(context, baseURL as string);
  const page = await context.newPage();

  // A reminder for the schedule, and the seeded rent flow turned on for a flow slot.
  await page.goto("/");
  const bar = page.getByLabel("Capture or jump");
  await bar.fill("remind system check tomorrow 9am");
  await bar.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Saved · Reminder" })).toBeVisible();
  await page.goto("/flows/flow-rent");
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("ON", { exact: true })).toBeVisible();

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "System" })
    .click();
  await expect(page).toHaveURL(/\/system$/);
  const tabs = page.getByRole("navigation", { name: "System sections" });
  await expect(
    page.getByRole("region", { name: "Collections" }).getByText("Reminders"),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Integrations" }).getByText("Web Push"),
  ).toBeVisible();

  await tabs.getByRole("link", { name: "Schedules" }).click();
  await expect(page).toHaveURL(/\/system\/schedules$/);
  const schedule = page.getByRole("region", { name: "Next 7 days" });
  await expect(schedule.getByRole("link", { name: "system check" })).toBeVisible();
  await expect(schedule.getByRole("link", { name: "Reminder notifications" })).toBeVisible();

  await tabs.getByRole("link", { name: "Jobs" }).click();
  const jobs = page.getByRole("region", { name: "Jobs" });
  await expect(jobs.getByText("Scheduled flows")).toBeVisible();
  // The backup job runs at start-up, so the database gets its first backup.
  await expect(
    page.getByRole("region", { name: "Recent runs" }).getByText("backups", { exact: true }),
  ).toBeVisible();

  await tabs.getByRole("link", { name: "Flows" }).click();
  const flows = page.getByRole("region", { name: "Flows" });
  await expect(flows.getByRole("link", { name: "Rent reminder" })).toBeVisible();
  await expect(flows.getByText(/next /)).toBeVisible();

  await tabs.getByRole("link", { name: "Agents" }).click();
  await expect(
    page.getByRole("region", { name: "Agents" }).getByText("No agents yet."),
  ).toBeVisible();

  await tabs.getByRole("link", { name: "Notifications" }).click();
  await expect(
    page.getByRole("region", { name: "Notification log" }).getByText(/missed reminders/),
  ).toBeVisible();

  expect(foreign).toEqual([]);
});
