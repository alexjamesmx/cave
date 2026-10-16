import { expect, test } from "bun:test";
import type { Doc } from "../../../shared/types.ts";
import { copyForAnotherAi } from "./ai-copy.ts";

const item = (data: Record<string, unknown>): Doc => ({
  id: "x",
  kind: "item",
  collection: "ai",
  data,
  stamps: {},
  actor: "t",
});

test("rules stay Markdown, JSON goes in a code block, each under its title and kind", () => {
  expect(
    copyForAnotherAi([
      item({
        _title: "AGENTS.md",
        kind: "rule",
        surface: "any",
        _body: "# Rules\nRun bun test.\n",
      }),
      item({
        _title: "github",
        kind: "mcp-server",
        surface: "claude-code",
        _body: '{\n  "command": "npx"\n}\n',
      }),
    ]),
  ).toBe(
    [
      "# My AI setup",
      "",
      "Rules, skills and tools I use with AI assistants. Secrets have been removed.",
      "",
      "## AGENTS.md (rule · any)",
      "",
      "# Rules",
      "Run bun test.",
      "",
      "## github (mcp-server · claude-code)",
      "",
      "```json",
      "{",
      '  "command": "npx"',
      "}",
      "```",
      "",
    ].join("\n"),
  );
});
