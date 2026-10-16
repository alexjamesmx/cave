import { type FormEvent, useMemo, useState } from "react";
import { AI, AI_KINDS, AI_SURFACES } from "../../../shared/ai.ts";
import { newId } from "../../../shared/ids.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { copyForAnotherAi } from "../logic/ai-copy.ts";
import { titleOf } from "../logic/views.ts";
import { useItems } from "../store/queries.ts";

const text = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Everything the AIs know and use, from `bun run ai-sync` and what the owner adds by hand.
 * Edits here are ordinary writes; `ai-sync --apply` writes them back to their files.
 */
export function AiPage() {
  const { local } = useCave();
  const items = (useItems(local.db, AI) ?? []).filter((d) => d.data._deleted !== true);
  const [kind, setKind] = useState("");
  const [surface, setSurface] = useState("");
  const [open, setOpen] = useState<string>();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string>();
  const [adding, setAdding] = useState(false);

  const shown = useMemo(
    () =>
      items
        .filter((d) => (!kind || d.data.kind === kind) && (!surface || d.data.surface === surface))
        .sort(
          (a, b) =>
            text(a.data.kind).localeCompare(text(b.data.kind)) ||
            titleOf(a).localeCompare(titleOf(b)),
        ),
    [items, kind, surface],
  );
  const selected = items.find((d) => d.id === open);

  const copy = async () => {
    const doc = copyForAnotherAi(shown.filter((d) => chosen.has(d.id)));
    try {
      await navigator.clipboard.writeText(doc);
      setMessage(`Copied ${chosen.size} as one Markdown document.`);
    } catch {
      setMessage("The clipboard refused; select fewer and try again.");
    }
  };

  return (
    <>
      <header style={{ display: "grid", gap: 6 }}>
        <h1 style={{ margin: 0, fontSize: 32, letterSpacing: "-0.03em" }}>AI</h1>
        <p className="muted" style={{ margin: 0 }}>
          Rules, skills, MCP servers, plugins, memory and agents, from{" "}
          <span className="num">bun run ai-sync</span> with secrets removed. Edits here go back to
          their files with <span className="num">bun run ai-sync --apply</span>, after you confirm
          each one.
        </p>
      </header>
      <div className="period-bar">
        <select
          className="input"
          aria-label="Kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="">Every kind</option>
          {AI_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select
          className="input"
          aria-label="Surface"
          value={surface}
          onChange={(e) => setSurface(e.target.value)}
        >
          <option value="">Every surface</option>
          {AI_SURFACES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn"
          disabled={chosen.size === 0}
          onClick={() => void copy()}
        >
          Copy for another AI ({chosen.size})
        </button>
        <button type="button" className="btn" onClick={() => setAdding(!adding)}>
          Add by hand
        </button>
      </div>
      <p role="status" className="muted" style={{ margin: 0, minHeight: 20 }}>
        {message}
      </p>
      {adding && (
        <ManualItem
          onSaved={(id) => {
            setAdding(false);
            setOpen(id);
          }}
        />
      )}
      {items.length === 0 && (
        <p className="muted">
          Nothing yet. Run <span className="num">bun run ai-sync</span> on the laptop.
        </p>
      )}
      <div className="flow-workspace">
        <section
          aria-label="AI items"
          className="panel"
          style={{ padding: 12, display: "grid", gap: 2 }}
        >
          {shown.map((d) => (
            <div key={d.id} className="system-row" style={{ alignItems: "center" }}>
              <input
                type="checkbox"
                aria-label={`Choose ${titleOf(d)}`}
                checked={chosen.has(d.id)}
                onChange={(e) => {
                  const next = new Set(chosen);
                  if (e.target.checked) next.add(d.id);
                  else next.delete(d.id);
                  setChosen(next);
                }}
              />
              <button
                type="button"
                className="link"
                style={{ flex: 1, textAlign: "left" }}
                onClick={() => setOpen(d.id)}
              >
                {titleOf(d)}
              </button>
              <span className="chip" style={{ background: "#11141a" }}>
                {text(d.data.kind)}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                {text(d.data.surface)} · {text(d.data.scope)}
              </span>
            </div>
          ))}
        </section>
        <aside aria-label="AI item" className="panel flow-editor">
          {selected ? (
            <Editor key={selected.id} doc={selected} />
          ) : (
            <span className="muted">Pick an item to read or edit it.</span>
          )}
        </aside>
      </div>
    </>
  );
}

function Editor({ doc }: { doc: Doc }) {
  const { local } = useCave();
  const [body, setBody] = useState(text(doc.data._body));
  const [saved, setSaved] = useState(false);
  const target = { id: doc.id, kind: "item" as const, collection: AI };
  const redacted = body.includes("‹redacted›");
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <strong>{titleOf(doc)}</strong>
      <span className="muted num" style={{ fontSize: 12, overflowWrap: "anywhere" }}>
        {text(doc.data.source)}
      </span>
      <label className="sr" htmlFor="ai-body">
        Content
      </label>
      <textarea
        id="ai-body"
        className="input"
        rows={18}
        style={{ height: "auto", fontFamily: "var(--font-num)", fontSize: 12 }}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setSaved(false);
        }}
      />
      {redacted && (
        <span className="muted" style={{ fontSize: 13 }}>
          Holds a redacted value: --apply won't write this one back; edit its file by hand.
        </span>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn primary"
          disabled={body === text(doc.data._body)}
          onClick={() => void local.write(target, { _body: body }).then(() => setSaved(true))}
        >
          Save
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            void local.write(target, {
              status: doc.data.status === "disabled" ? "active" : "disabled",
            })
          }
        >
          {doc.data.status === "disabled" ? "Enable" : "Disable"}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (
              confirm(
                `Delete “${titleOf(doc)}”? --apply will offer to move its file to .ai-trash/.`,
              )
            )
              void local.write(target, { _deleted: true });
          }}
        >
          Delete
        </button>
      </div>
      {saved && (
        <span role="status" className="muted">
          Saved. Run bun run ai-sync --apply on the laptop to write it to its file.
        </span>
      )}
    </div>
  );
}

/** Connectors and app settings have no file to read; they are added here. */
function ManualItem({ onSaved }: { onSaved(id: string): void }) {
  const { local } = useCave();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("connector");
  const [surface, setSurface] = useState("claude-app");
  const [body, setBody] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const id = newId();
    await local.write(
      { id, kind: "item", collection: AI },
      {
        _title: title.trim(),
        kind,
        surface,
        scope: "account",
        source: "manual",
        status: "active",
        _body: body,
      },
    );
    onSaved(id);
  };
  return (
    <form className="panel quick-form" aria-label="New AI item" onSubmit={(e) => void submit(e)}>
      <div className="quick-row">
        <input
          className="input"
          aria-label="Title"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select
          className="input"
          aria-label="Kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          {AI_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select
          className="input"
          aria-label="Surface"
          value={surface}
          onChange={(e) => setSurface(e.target.value)}
        >
          {AI_SURFACES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <textarea
        className="input"
        aria-label="Content"
        rows={6}
        style={{ height: "auto" }}
        placeholder="What it does, how it's set up (no secrets)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <button type="submit" className="btn primary" disabled={!title.trim()}>
        Save
      </button>
    </form>
  );
}
