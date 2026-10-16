import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { E2E_TOKEN, ownerContext } from "./helpers.ts";

const CLI = resolve("server/ai-sync/cli.ts");
// Assembled at run time so no token-shaped literal sits in the source.
const SECRET = ["gh", "p_", "R4n6D0mE2E".repeat(4)].join("");

const put = (path: string, text: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

function aiSync(baseURL: string, repo: string, home: string, args: string[] = [], input = "") {
  const result = spawnSync("bun", ["run", CLI, "--local", ...args], {
    cwd: repo,
    env: { ...process.env, PORT: new URL(baseURL).port, CAVE_TOKEN: E2E_TOKEN, AI_SYNC_HOME: home },
    input,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
}

test("ai-sync shows the repo's and the laptop's rules and skills with no secret, and --apply writes an edit back after a yes", async ({
  browser,
  baseURL,
}) => {
  const dir = mkdtempSync(join(tmpdir(), "cave-ai-e2e-"));
  try {
    const repo = join(dir, "repo");
    const home = join(dir, "home");
    put(join(repo, "AGENTS.md"), "# Rules\nRun bun test.\n");
    put(
      join(repo, ".mcp.json"),
      JSON.stringify({ mcpServers: { github: { command: "npx", env: { GITHUB_TOKEN: SECRET } } } }),
    );
    put(join(home, ".claude", "CLAUDE.md"), `Be concise. Token ${SECRET} stays here.\n`);
    put(
      join(home, ".claude", "skills", "e2e-notes", "SKILL.md"),
      "---\nname: e2e-notes\n---\nTake notes.\n",
    );

    const out = aiSync(baseURL as string, repo, home);
    expect(out).toMatch(/Pushed \d+/);
    expect(out).not.toContain(SECRET);

    const context = await ownerContext(browser, {
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage();
    await page.goto("/ai");
    const list = page.getByRole("region", { name: "AI items" });
    for (const name of ["AGENTS.md", "github", ".claude/CLAUDE.md", "e2e-notes"])
      await expect(list.getByRole("button", { name, exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(SECRET);

    // Edit a rule in the Cave, then write it back from the laptop.
    await list.getByRole("button", { name: "AGENTS.md", exact: true }).click();
    const editor = page.getByLabel("Content");
    await editor.fill("# Rules\nRun bun test, then bun run check.\n");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Saved. Run bun run ai-sync --apply" }),
    ).toBeVisible();
    await expect(async () => {
      expect(aiSync(baseURL as string, repo, home)).toContain("1 edited in the Cave");
    }).toPass({ timeout: 20_000 });
    const applied = aiSync(baseURL as string, repo, home, ["--apply"], "y\n");
    expect(applied).toContain("Wrote 1");
    expect(readFileSync(join(repo, "AGENTS.md"), "utf8")).toBe(
      "# Rules\nRun bun test, then bun run check.\n",
    );
    // Back in step: the next sync has nothing to do for it.
    expect(aiSync(baseURL as string, repo, home)).not.toContain("edited in the Cave");

    // Copy for another AI: one Markdown document, secrets still out.
    await page.reload();
    await page.getByLabel("Choose AGENTS.md").check();
    await page.getByLabel("Choose .claude/CLAUDE.md").check();
    await page.getByRole("button", { name: "Copy for another AI (2)" }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("# My AI setup");
    expect(copied).toContain("## AGENTS.md (rule · any)");
    expect(copied).not.toContain(SECRET);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
