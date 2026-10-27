import { addReminder, offOriginRequests, ownerContext, wallIn } from "./helpers.ts";
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
  await addReminder(page, { title: "system check", date: wallIn(24 * 60).date, time: "09:00" });
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
  await expect(schedule.getByRole("link", { name: "Scheduled flows" })).toBeVisible();

  await tabs.getByRole("link", { name: "Jobs" }).click();
  const jobs = page.getByRole("region", { name: "Jobs" });
  await expect(jobs.getByText("Scheduled flows")).toBeVisible();
  // The backup job runs at start-up, so the database gets its first backup.
  await expect(
    page.getByRole("region", { name: "Recent runs" }).getByText("backups", { exact: true }),
  ).toBeVisible();

  await tabs.getByRole("link", { name: "Notifications" }).click();
  await expect(
    page.getByRole("region", { name: "Notification log" }).getByText("Titles are never stored."),
  ).toBeVisible();

  // Flows → Runs holds the jobs' runs too (M12 part 4): the start-up backup is there.
  await page.goto("/flows/runs");
  await expect(
    page
      .getByRole("region", { name: "Flow runs" })
      .getByRole("link", { name: "Daily backup" })
      .first(),
  ).toBeVisible();

  // Agents: tokens and use; other specs may have added agents (runs.e2e mints one).
  await page.goto("/settings/agents");
  await expect(page.getByRole("region", { name: "Agents" })).toContainText(/No agents yet\.|read/);
  await expect(page.getByRole("region", { name: "Proposals" })).toBeVisible();
  // Agents' writes and their Undo live under Data.
  await page.goto("/settings/data");
  await expect(page.getByRole("region", { name: "Undo history" })).toBeVisible();

  expect(foreign).toEqual([]);
});
