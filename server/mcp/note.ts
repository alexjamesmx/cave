import { INBOX, NOTES } from "../../shared/notes.ts";
import { type AgentWriter, MAX_BODY_BYTES, type WriteResult } from "../agent-writer.ts";

/**
 * `add_note`: a new note in the Cave's Inbox, marked as written by an agent. It goes through
 * the agent writer like any create (title limit, allowlist, the change log and Undo); since
 * M9 nothing writes to the Obsidian vault.
 */
export function addNote(writer: AgentWriter, input: { title: string; body: string }): WriteResult {
  if (new TextEncoder().encode(input.body).length > MAX_BODY_BYTES)
    return { ok: false, error: "body is larger than 100 kB" };
  return writer.create(NOTES, {
    title: input.title,
    body: input.body.trim(),
    fields: { folder: INBOX, source: "agent" },
  });
}
