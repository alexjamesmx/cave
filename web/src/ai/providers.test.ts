import { expect, test } from "bun:test";
import { CONNECTOR_HINT, claudeProvider, claudeUrl, currentProvider } from "./providers.ts";

test("the Claude URL prefills the question after the connector line", () => {
  const url = new URL(claudeUrl("  What did I spend on food this month? "));
  expect(url.origin + url.pathname).toBe("https://claude.ai/new");
  expect(url.searchParams.get("q")).toBe(
    `${CONNECTOR_HINT}\n\nWhat did I spend on food this month?`,
  );
});

test("asking copies the question, then opens Claude; a failed copy still opens", async () => {
  const opened: string[] = [];
  const copied: string[] = [];
  await claudeProvider.ask("hola", {
    open: (u) => opened.push(u),
    copy: async (t) => void copied.push(t),
  });
  await claudeProvider.ask("again", {
    open: (u) => opened.push(u),
    copy: async () => {
      throw new Error("denied");
    },
  });
  expect(copied).toEqual(["hola"]);
  expect(opened).toHaveLength(2);
  expect(currentProvider().id).toBe("claude");
});
