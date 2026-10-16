import { type Parsed, parseReminder, type WhenContext } from "../../../shared/when.ts";

/**
 * The Reminder form's "When": the same plain language as the old `remind` command ("tomorrow
 * 9am", "cada mes 22 9:00"). The title has its own field, so only these words are read.
 */
export function parseWhen(when: string, ctx: WhenContext): Parsed {
  if (!when.trim()) return { ok: false, hint: "Add when." };
  // A stand-in title the parser keeps, so every word of `when` is free to be read as a date.
  return parseReminder(`~ ${when}`, ctx);
}
