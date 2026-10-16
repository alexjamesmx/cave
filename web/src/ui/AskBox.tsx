import { type FormEvent, useState } from "react";
import { currentProvider } from "../ai/providers.ts";

/** One box to ask or tell the Cave anything; the provider decides where the answer appears. */
export function AskBox({ autoFocus = false, onAsked }: { autoFocus?: boolean; onAsked?(): void }) {
  const [text, setText] = useState("");
  const provider = currentProvider();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    await provider.ask(text, {
      open: (url) => window.open(url, "_blank", "noopener"),
      copy: (value) => navigator.clipboard.writeText(value),
    });
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
          {provider.where}; the question is also copied.
        </span>
        <button type="submit" className="btn primary" disabled={!text.trim()}>
          Ask
        </button>
      </div>
    </form>
  );
}
