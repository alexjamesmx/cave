/**
 * Where the Ask box sends a question. Model-agnostic: a provider is one entry here.
 *
 * Named and not built yet (each comes when the owner picks it): an Anthropic API key
 * provider, OpenAI-compatible endpoints (which covers free and local models), and asking
 * through the Telegram bot.
 */
export interface AiProvider {
  id: string;
  label: string;
  /** Where the answer appears, shown under the box: "Opens in Claude". */
  where: string;
  available(): boolean;
  ask(text: string, context: AskContext): Promise<void>;
}

export interface AskContext {
  /** Opens a URL in a new tab or the installed app. */
  open(url: string): void;
  /** Best-effort copy, so the question survives if the prefill doesn't. */
  copy(text: string): Promise<void>;
}

/** The first line tells Claude where the owner's data lives. */
export const CONNECTOR_HINT = "Use my cave connector to read or change my Cave.";

export function claudeUrl(text: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(`${CONNECTOR_HINT}\n\n${text.trim()}`)}`;
}

/**
 * Free: the answer happens in Claude, which reads and writes the Cave through the connector.
 * `?q=` prefills a new chat; Claude may ask to confirm a prefilled prompt before sending it.
 */
export const claudeProvider: AiProvider = {
  id: "claude",
  label: "Claude",
  where: "Opens in Claude",
  available: () => true,
  async ask(text, context) {
    await context.copy(text).catch(() => {});
    context.open(claudeUrl(text));
  },
};

export const PROVIDERS: AiProvider[] = [claudeProvider];

/** The provider in use: the first available one, until Settings lets the owner choose. */
export const currentProvider = (): AiProvider =>
  PROVIDERS.find((p) => p.available()) ?? claudeProvider;
