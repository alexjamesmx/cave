import { renderMermaidSVG } from "beautiful-mermaid";

/**
 * A project's Diagram tab (M11 part 6): Mermaid source rendered to SVG by beautiful-mermaid,
 * synchronously. The renderer's SVG carries one `style` attribute (its colour variables) and a
 * `<style>` element (an `@import` of a Google font and the derived variables); both would be
 * refused by the page's Content-Security-Policy and the font would leave the machine, so they
 * are removed here and `web/src/styles.css` carries the same rules under `.diagram`.
 */

export type Rendered = { ok: true; svg: string } | { ok: false; error: string };

const STYLE_ELEMENT = /<style\b[^>]*>[\s\S]*?<\/style>/gi;
const STYLE_ATTR = /\s+style="[^"]*"/gi;
const SCRIPTISH =
  /<(script|foreignObject)\b[^>]*>[\s\S]*?<\/\1>|<(script|foreignObject)\b[^>]*\/>/gi;
const EVENT_ATTR = /\s+on[a-z]+="[^"]*"/gi;

/** The renderer's SVG with nothing the policy refuses: no `style`, no `<style>`, no scripts. */
export function cleanDiagramSvg(svg: string): string {
  return svg
    .replace(STYLE_ELEMENT, "")
    .replace(SCRIPTISH, "")
    .replace(EVENT_ATTR, "")
    .replace(STYLE_ATTR, "");
}

/** Renders `source`; a parse error comes back as text for the editor to show. */
export function renderDiagram(source: string): Rendered {
  const text = source.trim();
  if (!text) return { ok: false, error: "" };
  try {
    return { ok: true, svg: cleanDiagramSvg(renderMermaidSVG(text)) };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "The diagram could not be read." };
  }
}

export const DIAGRAM_EXAMPLE = `flowchart TD
  Plan --> Build --> Ship
  Build --> Review{Ready?}
  Review -->|no| Build
  Review -->|yes| Ship`;
