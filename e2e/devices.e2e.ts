import { fillReminder, offOriginRequests, ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("Devices & server renders each sub-section with a reminder and a job run; Agents and Flows → Runs hold what System had", async ({
  browser,
  baseURL,
}) => {
  const context = await ownerContext(browser);
  const foreign = offOriginRequests(context, baseURL as string);
  const page = await context.newPage();

  // A reminder for the schedule, and the seeded rent flow turned on for a flow slot.
  await page.goto("/");
  const form = await fillReminder(page, "system check", "tomorrow 9am");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved · Reminder" })).toBeVisible();
  await page.goto("/flows/flow-rent");
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("ON", { exact: true })).toBeVisible();

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Settings" })
    .click();
  await expect(page).toHaveURL(/\/settings$/);
  await page
    .getByRole("navigation", { name: "Settings tabs" })
    .getByRole("link", { name: "Devices & server" })
    .click();
  await expect(page).toHaveURL(/\/settings\/devices$/);
  const tabs = page.getByRole("navigation", { name: "Devices sections" });
  await expect(
    page
      .getByRole("region", { name: "This device" })
      .getByRole("button", { name: "Lock this device" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Server" }).getByText("Last backup")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Integrations" }).getByText("Web Push"),
  ).toBeVisible();

  await tabs.getByRole("link", { name: "Schedules" }).click();
  await expect(page).toHaveURL(/\/settings\/devices\/schedules$/);
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

  await tabs.getByRole("link", { name: "Notifications" }).click();
  await expect(
    page.getByRole("region", { name: "Notification log" }).getByText(/\d+ missed reminders?/),
  ).toBeVisible();

  // Flows → List: every flow with its last run and next slot.
  await page.goto("/flows/list");
  const flows = page.getByRole("region", { name: "Flows" });
  await expect(flows.getByRole("link", { name: "Rent reminder" })).toBeVisible();
  await expect(flows.getByText(/next /)).toBeVisible();

  // Agents: tokens and use; other specs may have added agents (runs.e2e mints one).
  await page.goto("/settings/agents");
  await expect(page.getByRole("region", { name: "Agents" })).toContainText(/No agents yet\.|read/);
  await expect(page.getByRole("region", { name: "Proposals" })).toBeVisible();
  // Agents' writes and their Undo live under Data.
  await page.goto("/settings/data");
  await expect(page.getByRole("region", { name: "Undo history" })).toBeVisible();

  expect(foreign).toEqual([]);
});
