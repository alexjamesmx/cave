import { useMemo, useState } from "react";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { DIAGRAM_EXAMPLE, renderDiagram } from "../logic/diagram.ts";
import { DiagramSvg } from "./DiagramSvg.tsx";

/**
 * A project's Diagram tab: Mermaid source in the project's `diagram` field, rendered beside
 * the editor on a desktop and under it on a phone. Saved on blur like any field; agents edit
 * it with `update`. A parse error shows under the editor and the last good render stays.
 */
export function Diagram({ project }: { project: Doc }) {
  const { local } = useCave();
  const stored = typeof project.data.diagram === "string" ? project.data.diagram : "";
  const [draft, setDraft] = useState(stored);
  // Another device's edit replaces an untouched draft; a draft being typed is kept.
  const [base, setBase] = useState(stored);
  if (stored !== base) {
    setBase(stored);
    if (draft === base) setDraft(stored);
  }
  const rendered = useMemo(() => renderDiagram(draft), [draft]);
  const [lastGood, setLastGood] = useState<string>();
  if (rendered.ok && rendered.svg !== lastGood) setLastGood(rendered.svg);
  const save = () => {
    if (draft !== stored)
      void local.write(
        { id: project.id, kind: "item", collection: "projects" },
        { diagram: draft.trim() || null },
      );
  };

  return (
    <div className="diagram-split">
      <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
        <label className="k" htmlFor="diagram-source">
          Mermaid
        </label>
        <textarea
          id="diagram-source"
          className="input diagram-source"
          value={draft}
          spellCheck={false}
          placeholder={DIAGRAM_EXAMPLE}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
        />
        {!rendered.ok && rendered.error && (
          <span role="alert" className="error" style={{ fontSize: 13 }}>
            {rendered.error}
          </span>
        )}
        {!draft && (
          <button type="button" className="btn" onClick={() => setDraft(DIAGRAM_EXAMPLE)}>
            Start from an example
          </button>
        )}
        <span className="muted" style={{ fontSize: 13 }}>
          Flowcharts, sequence, class, state and ER diagrams. Saved when you leave the box.
        </span>
      </div>
      <section className="panel diagram" aria-label="Diagram">
        {lastGood ? (
          <DiagramSvg markup={lastGood} />
        ) : (
          <span className="muted">Nothing to draw yet.</span>
        )}
      </section>
    </div>
  );
}
