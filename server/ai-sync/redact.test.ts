import { expect, test } from "bun:test";
import { REDACTED, redactFile, redactText } from "./redact.ts";

// Realistic shapes with made-up values, assembled at run time so no token-shaped literal sits
// in the source for a secret scanner to flag. None of these is a real credential.
const join = (...parts: string[]) => parts.join("");
const FAKE = {
  anthropic: join("sk", "-ant-api03-", "A1b2C3d4E5".repeat(8)),
  github: join("gh", "p_", "Z9y8X7w6V5".repeat(4)),
  cave: join("ca", "ve_", "q1W2e3R4t5".repeat(4)),
  telegram: join("123456789", ":", "AAH".repeat(12)),
  hex: "9f86d081884c7d65".repeat(4),
};

test("an MCP config keeps its shape and loses every secret", () => {
  const mcp = JSON.stringify({
    mcpServers: {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: FAKE.github, LOG_LEVEL: "info" },
      },
      cave: {
        type: "http",
        url: "https://cave.example.dev/mcp",
        headers: { Authorization: `Bearer ${FAKE.cave}` },
      },
      exa: { type: "http", url: `https://mcp.exa.ai/mcp?exaApiKey=${FAKE.hex}` },
    },
  });
  const out = redactFile(".mcp.json", mcp);
  for (const secret of Object.values(FAKE)) expect(out).not.toContain(secret);
  const parsed = JSON.parse(out);
  expect(parsed.mcpServers.github.command).toBe("npx");
  expect(parsed.mcpServers.github.args).toEqual(["-y", "@modelcontextprotocol/server-github"]);
  // `env` holds secrets as a whole: every value goes, the names stay.
  expect(parsed.mcpServers.github.env).toEqual({
    GITHUB_PERSONAL_ACCESS_TOKEN: REDACTED,
    LOG_LEVEL: REDACTED,
  });
  expect(parsed.mcpServers.cave.headers.Authorization).toBe(REDACTED);
  expect(parsed.mcpServers.cave.url).toBe("https://cave.example.dev/mcp");
  expect(parsed.mcpServers.exa.url).toBe(`https://mcp.exa.ai/mcp?exaApiKey=${REDACTED}`);
});

test("settings: permission rules stay, keys and tokens anywhere go", () => {
  const settings = JSON.stringify({
    permissions: { allow: ["Bash(bun test:*)"], ask: ["Bash(git push *)"] },
    env: { ANTHROPIC_API_KEY: FAKE.anthropic },
    apiKeyHelper: "~/bin/key.sh",
    statusLine: { command: "powershell -File C:\\Users\\me\\.claude\\hooks\\line.ps1" },
  });
  const out = JSON.parse(redactFile("settings.json", settings));
  expect(out.permissions).toEqual({ allow: ["Bash(bun test:*)"], ask: ["Bash(git push *)"] });
  expect(out.env.ANTHROPIC_API_KEY).toBe(REDACTED);
  expect(out.apiKeyHelper).toBe(REDACTED);
  expect(out.statusLine.command).toContain("line.ps1");
});

test("Markdown and plain text lose credential-looking strings and keep the prose", () => {
  const md = [
    "# Rules",
    `Use the token ${FAKE.cave} only in the header.`,
    `Bot: ${FAKE.telegram}`,
    "Repository: https://github.com/owner/repo/blob/main/docs/system.md",
    "Run bun test before reporting.",
  ].join("\n");
  const out = redactText(md);
  for (const secret of [FAKE.cave, FAKE.telegram]) expect(out).not.toContain(secret);
  expect(out).toContain("Run bun test before reporting.");
  expect(out).toContain("https://github.com/owner/repo/blob/main/docs/system.md");
  expect(out.match(new RegExp(REDACTED, "g"))).toHaveLength(2);
});

test("a file that isn't valid JSON is still scanned as text", () => {
  expect(redactFile("broken.json", `{ "token": "${FAKE.github}"`)).not.toContain(FAKE.github);
});
