import { type FormEvent, useState } from "react";
import { ASK_WHERE, askClaude, browserAsk } from "../logic/ask-claude.ts";

/** One box to ask or tell the Cave anything; the answer happens in Claude. */
export function AskBox({ autoFocus = false, onAsked }: { autoFocus?: boolean; onAsked?(): void }) {
  const [text, setText] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    await askClaude(text, browserAsk);
    setText("");
    onAsked?.();
  };

  return (
    <form className="ask" onSubmit={(e) => void submit(e)}>
      <label className="sr" htmlFor="ask-box">
        Ask or tell the Cave
      </label>
      <textarea
        id="ask-box"
        className="input ask-input"
        rows={2}
        // biome-ignore lint/a11y/noAutofocus: the Ask sheet opens to type
        autoFocus={autoFocus}
        placeholder="Ask or tell the Cave anything…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="muted" style={{ fontSize: 13, flex: 1 }}>
          {ASK_WHERE}; the question is also copied.
        </span>
        <button type="submit" className="btn primary" disabled={!text.trim()}>
          Ask
        </button>
      </div>
    </form>
  );
}
