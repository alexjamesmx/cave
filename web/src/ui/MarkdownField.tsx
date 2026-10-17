import { useState } from "react";
import { MarkdownView } from "./Markdown.tsx";

/**
 * A Markdown body: a plain textarea saved on blur, and Preview to see it rendered by the one
 * renderer (no HTML, safe links, no remote images). Editing stays the default.
 */
export function MarkdownField({
  id,
  label,
  body,
  rows,
  placeholder,
  className = "input",
  onSave,
}: {
  id: string;
  label: string;
  body: string;
  rows: number;
  placeholder?: string;
  className?: string;
  onSave(text: string): void;
}) {
  const [preview, setPreview] = useState(false);
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label className="k" htmlFor={id} style={{ flex: 1 }}>
          {label}
        </label>
        <button
          type="button"
          className="btn"
          aria-pressed={preview}
          onClick={() => setPreview(!preview)}
        >
          {preview ? "Edit" : "Preview"}
        </button>
      </div>
      {preview ? (
        body.trim() ? (
          <MarkdownView text={body} />
        ) : (
          <p className="muted">Nothing written yet.</p>
        )
      ) : (
        <textarea
          key={body}
          id={id}
          className={className}
          rows={rows}
          defaultValue={body}
          {...(placeholder ? { placeholder } : {})}
          onBlur={(e) => {
            if (e.target.value !== body) onSave(e.target.value);
          }}
        />
      )}
    </div>
  );
}
