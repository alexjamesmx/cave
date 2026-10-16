import { expect, test } from "bun:test";
import type { Doc } from "../../../shared/types.ts";
import { improvePrompt, updateAllPrompt } from "./ai-prompts.ts";

test("the update prompt names the collection, the fields to set and the rules", () => {
  const p = updateAllPrompt();
  expect(p).toContain('query the collection "ai"');
  expect(p).toContain("source (manual)");
  expect(p).toContain("never write a token");
  expect(p).toContain("keep every ‹redacted›");
  expect(p).toContain("never delete");
});

test("the improve prompt lists each chosen item by title and id", () => {
  const doc = (id: string, title: string): Doc => ({
    id,
    kind: "item",
    collection: "ai",
    data: { _title: title },
    stamps: {},
    actor: "t",
  });
  const p = improvePrompt([doc("ai-1", "AGENTS.md"), doc("ai-2", "deploy")]);
  expect(p).toContain("- AGENTS.md (id ai-1)\n- deploy (id ai-2)");
  expect(p).toContain("never delete");
});
