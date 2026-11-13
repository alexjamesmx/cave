import CodeBlock from "@tiptap/extension-code-block";
import {
  NodeViewContent,
  NodeViewWrapper,
  type ReactNodeViewProps,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { createContext, useContext } from "react";
import { navigate } from "../app/router.ts";
import { MarkdownDiagram } from "../ui/DiagramSvg.tsx";
import { Wikilink } from "./marks.ts";

/** Where a `[[Title]]` goes, and what happens with one to a note that doesn't exist yet. */
export interface Links {
  resolve?: (title: string) => { href: string } | undefined;
  onMissing?: (title: string) => void;
}

export const LinksContext = createContext<Links>({});

function WikilinkView({ node }: ReactNodeViewProps) {
  const { resolve, onMissing } = useContext(LinksContext);
  const title = String(node.attrs.title);
  const text = String(node.attrs.label ?? title);
  const target = resolve?.(title);
  return (
    <NodeViewWrapper as="span">
      {target ? (
        <a
          className="wikilink"
          href={target.href}
          onClick={(e) => {
            // A link inside an editable area doesn't follow itself.
            e.preventDefault();
            navigate(target.href);
          }}
        >
          {text}
        </a>
      ) : (
        <button
          type="button"
          className="wikilink missing"
          title={onMissing ? `Create “${title}”` : `No note “${title}” yet`}
          onClick={() => onMissing?.(title)}
        >
          {text}
        </button>
      )}
    </NodeViewWrapper>
  );
}

/** A code block; a mermaid one is drawn under its source as you type it. */
function CodeBlockView({ node }: ReactNodeViewProps) {
  return (
    <NodeViewWrapper className="nb-code">
      <pre>
        <NodeViewContent<"code"> as="code" />
      </pre>
      {node.attrs.language === "mermaid" && node.textContent.trim() && (
        <div contentEditable={false} className="nb-diagram">
          <MarkdownDiagram source={node.textContent} />
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const WikilinkWithView = Wikilink.extend({
  addNodeView: () => ReactNodeViewRenderer(WikilinkView),
});

export const CodeBlockWithDiagram = CodeBlock.extend({
  addNodeView: () => ReactNodeViewRenderer(CodeBlockView),
});
