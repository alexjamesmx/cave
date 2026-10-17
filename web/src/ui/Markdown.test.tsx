import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownView, wikilinksToMarkdown, wikilinkTitles } from "./Markdown.tsx";

const notes = new Map([["cave plan", "/projects/notes/n1"]]);
const html = (text: string) =>
  renderToStaticMarkup(
    <MarkdownView
      text={text}
      resolve={(title) => {
        const href = notes.get(title.toLowerCase());
        return href ? { href } : undefined;
      }}
    />,
  );

test("raw HTML shows as text, never as elements", () => {
  const out = html('<script>alert(1)</script>\n\nHi <img src=x onerror="alert(1)"> there');
  expect(out).not.toContain("<script");
  expect(out).not.toContain("<img");
  expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  expect(out).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
});

test("only http, https and mailto become links, opening in a new tab", () => {
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "vbscript:msgbox(1)"]) {
    const out = html(`[click](${bad})`);
    expect(out).not.toContain("<a");
    expect(out).toContain("<span>click</span>");
  }
  expect(html("[site](https://example.com)")).toBe(
    '<div class="markdown"><p><a href="https://example.com" target="_blank" rel="noopener noreferrer">site</a></p></div>',
  );
});

test("an image is never loaded: it shows as a link to its address", () => {
  const out = html("![a cat](https://evil.example/cat.png)");
  expect(out).not.toContain("<img");
  expect(out).toContain('href="https://evil.example/cat.png"');
  expect(out).toContain("a cat");
});

test("wikilinks: existing, missing and labelled; code is left alone", () => {
  const out = html("See [[Cave plan]], [[Cave plan|the plan]] and [[Nowhere]]. `[[code]]`");
  expect(out).toContain('<a class="wikilink" href="/projects/notes/n1">Cave plan</a>');
  expect(out).toContain('<a class="wikilink" href="/projects/notes/n1">the plan</a>');
  expect(out).toContain('class="wikilink missing"');
  expect(out).toContain("Nowhere");
  expect(out).toContain("<code>[[code]]</code>");
  expect(wikilinksToMarkdown("```\n[[x]]\n```")).toBe("```\n[[x]]\n```");
  expect(wikilinkTitles("[[A]] [[b|x]] [[A]]")).toEqual(["A", "b"]);
});

test("GitHub tables, task lists and fenced code render, code plainly", () => {
  const out = html(
    "| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n\n```ts\nconst x = 1;\n```",
  );
  expect(out).toContain("<table>");
  expect(out).toContain('type="checkbox"');
  expect(out).toContain("<pre><code");
  expect(out).toContain("const x = 1;");
});
