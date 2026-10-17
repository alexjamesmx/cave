import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, test } from "@playwright/test";
import { ownerContext } from "./helpers.ts";

/** A write-scope agent on the e2e server's database, as `bun run agent add` makes one. */
function mintAgent(name: string): string {
  const out = spawnSync(
    "bun",
    ["run", "server/agent-cli.ts", "add", name, "--scopes", "read,write"],
    {
      env: {
        ...process.env,
        CAVE_DB_PATH: join(process.env.CAVE_E2E_DIR as string, "cave.db"),
        CAVE_TOKEN: "",
        CAVE_HOST: "",
      },
      encoding: "utf8",
    },
  );
  const token = out.stdout.trim().split("\n").at(-1) ?? "";
  if (!token.startsWith("cave_")) throw new Error(`no agent token: ${out.stderr}`);
  return token;
}

test("a run an agent starts shows in the project's Activity, on its Map and in AI → Activity, updating live", async ({
  browser,
  baseURL,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  await page.goto("/projects/all");
  await page.getByRole("textbox", { name: "New project" }).fill(`Runs e2e ${Date.now()}`);
  await page.getByLabel("Template").selectOption({ label: "Software" });
  await page.getByRole("button", { name: "New project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9A-Z]{26}$/);
  const project = new URL(page.url()).pathname.split("/")[2] as string;

  const client = new Client(
    { name: "cave-e2e", version: "1.0.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL("/mcp", baseURL), {
      requestInit: { headers: { authorization: `Bearer ${mintAgent(`runs-e2e-${Date.now()}`)}` } },
    }),
  );
  const call = async (name: string, args: Record<string, unknown>) =>
    (await client.callTool({ name, arguments: args })) as {
      structuredContent?: { id: string };
      isError?: boolean;
    };

  // Devices pull every minute, and whenever the page becomes visible: the test uses the latter.
  // A busy server can answer after the first pull, so each check syncs again until it passes.
  const synced = (check: () => Promise<unknown>) =>
    expect(async () => {
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await check();
    }).toPass({ timeout: 20_000 });

  await page.goto(`/projects/${project}/activity`);
  const runs = page.getByRole("list", { name: "Project runs" });
  await expect(runs).toContainText("No runs yet.");
  // The project was made on this device; the agent sees it once it has synced up.
  let run = "";
  await expect(async () => {
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    const started = await call("start_run", { project, title: "Plan the parts" });
    expect(started.isError).toBeUndefined();
    run = started.structuredContent?.id as string;
  }).toPass({ timeout: 20_000 });
  await call("log_step", { run, title: "Read the goal", status: "done" });
  const row = runs.getByRole("button", { name: /Plan the parts/ });
  await synced(() => expect(row).toContainText("running", { timeout: 1000 }));
  await row.click();
  const steps = page.getByRole("list", { name: "Steps of Plan the parts" });
  await expect(steps.getByRole("listitem")).toHaveText([/Read the goal/]);

  // A new step arrives without a reload.
  await call("log_step", {
    run,
    title: "Drafted three parts",
    status: "running",
    detail: "Plan, Build, Ship",
  });
  await synced(() =>
    expect(steps.getByRole("listitem")).toHaveText(
      [/Read the goal/, /Drafted three parts.*Plan, Build, Ship/],
      { timeout: 1000 },
    ),
  );

  // While active, it glows on the Map.
  await page
    .getByRole("navigation", { name: "Project tabs" })
    .getByRole("link", { name: "Map" })
    .click();
  await expect(page.locator(".map-run", { hasText: "Plan the parts" })).toBeVisible();

  // Finished: it leaves the Map and shows done in AI → Activity.
  await call("finish_run", { run, status: "done", summary: "Three parts drafted." });
  await synced(() =>
    expect(page.locator(".map-run", { hasText: "Plan the parts" })).toHaveCount(0, {
      timeout: 1000,
    }),
  );
  await page.goto("/ai/activity?source=agent");
  const all = page.getByRole("list", { name: "All runs" });
  await expect(all.getByRole("button", { name: /Plan the parts/ })).toContainText("done");
  await client.close();
});
