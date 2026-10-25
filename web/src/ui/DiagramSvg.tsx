import { useEffect, useMemo, useRef } from "react";
import { renderDiagram } from "../logic/diagram.ts";

/** The cleaned SVG as elements; parsed as SVG, so nothing in it runs or loads. */
export function DiagramSvg({ markup }: { markup: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
    el.replaceChildren(document.importNode(doc.documentElement, true));
  }, [markup]);
  return <div ref={host} className="diagram-host" />;
}

/** A ```mermaid block inside Markdown: drawn, or shown as code with the reason it can't be. */
export function MarkdownDiagram({ source }: { source: string }) {
  const rendered = useMemo(() => renderDiagram(source), [source]);
  if (rendered.ok)
    return (
      <div className="diagram md-diagram" role="img" aria-label="Diagram">
        <DiagramSvg markup={rendered.svg} />
      </div>
    );
  return (
    <>
      <pre>
        <code>{source}</code>
      </pre>
      {rendered.error && <p className="error">Diagram: {rendered.error}</p>}
    </>
  );
}
