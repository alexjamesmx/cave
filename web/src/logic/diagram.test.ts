import { expect, test } from "bun:test";
import { cleanDiagramSvg, DIAGRAM_EXAMPLE, renderDiagram } from "./diagram.ts";

test("a flowchart renders to an SVG with no style attribute, no style element and no script", () => {
  const out = renderDiagram(DIAGRAM_EXAMPLE);
  expect(out.ok).toBe(true);
  if (!out.ok) return;
  expect(out.svg.startsWith("<svg")).toBe(true);
  expect(out.svg).not.toMatch(/ style="/);
  expect(out.svg).not.toMatch(/<style/);
  expect(out.svg).not.toMatch(/<script/i);
  expect(out.svg).not.toMatch(/googleapis/);
  expect(out.svg).toContain("Plan");
  // The renderer's colours come through its own variables, which the stylesheet defines.
  expect(out.svg).toContain("var(--_");
});

test("a broken diagram is an error with text; an empty one is no diagram", () => {
  // The renderer forgives most body slips; a header it does not know is refused.
  const broken = renderDiagram("mindmap?\n  A --> B");
  expect(broken.ok).toBe(false);
  if (!broken.ok) expect(broken.error.length).toBeGreaterThan(0);
  expect(renderDiagram("   ")).toEqual({ ok: false, error: "" });
});

test("the cleaner strips what the policy refuses, whatever the renderer emits", () => {
  const dirty =
    '<svg style="--bg:#000"><style>a{}</style><script>x()</script><g onclick="y()"><text style="fill:red">t</text></g><foreignObject><div/></foreignObject></svg>';
  expect(cleanDiagramSvg(dirty)).toBe("<svg><g><text>t</text></g></svg>");
});
