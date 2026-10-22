/**
 * Where a question from the app goes: a new Claude chat, which reads and writes the Cave
 * through the cave connector. `?q=` prefills the chat; Claude may ask to confirm a prefilled
 * prompt before sending it, so the question is copied first and survives either way.
 */

/** The first line tells Claude where the owner's data lives. */
export const CONNECTOR_HINT = "Use my cave connector to read or change my Cave.";

/** Shown under every Ask box. */
export const ASK_WHERE = "Opens in Claude";

export function claudeUrl(text: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(`${CONNECTOR_HINT}\n\n${text.trim()}`)}`;
}

export interface AskContext {
  /** Opens a URL in a new tab or the installed app. */
  open(url: string): void;
  /** Best-effort copy, so the question survives if the prefill doesn't. */
  copy(text: string): Promise<void>;
}

/** Copies the question, then opens Claude with it; a refused copy still opens. */
export async function askClaude(text: string, context: AskContext): Promise<void> {
  await context.copy(text).catch(() => {});
  context.open(claudeUrl(text));
}

/** The browser's `AskContext`: a new tab and the clipboard. */
export const browserAsk: AskContext = {
  open: (url) => void window.open(url, "_blank", "noopener"),
  copy: (value) => navigator.clipboard.writeText(value),
};
