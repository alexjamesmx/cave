import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PALETTE } from "../../shared/palette.ts";
import { contrast } from "./logic/contrast.ts";

/** The `:root` tokens of the stylesheet that are plain colours; aliases and sizes are skipped. */
function tokens(): Record<string, string> {
  const css = readFileSync(join(import.meta.dir, "styles.css"), "utf8");
  const root = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  const out: Record<string, string> = {};
  for (const m of root.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi))
    out[m[1] ?? ""] = m[2] ?? "";
  return out;
}

const T = tokens();
const token = (name: string): string => {
  const value = T[name];
  if (!value) throw new Error(`no colour token --${name} in styles.css`);
  return value;
};
const SURFACES = ["bg", "panel", "on", "control", "side"];
const STATUS = ["ok", "warn", "wait", "bad", "vio", "teal", "orange", "purple"];

test("text and secondary text read on every surface (WCAG AA, 4.5:1)", () => {
  for (const surface of SURFACES) {
    expect(contrast(token("text"), token(surface))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("muted"), token(surface))).toBeGreaterThanOrEqual(4.5);
  }
  expect(contrast(token("on-accent"), token("accent"))).toBeGreaterThanOrEqual(4.5);
});

test("status colours stand out on the page and in panels (3:1)", () => {
  for (const status of STATUS) {
    expect(contrast(token(status), token("bg"))).toBeGreaterThanOrEqual(3);
    expect(contrast(token(status), token("panel"))).toBeGreaterThanOrEqual(3);
  }
});

test("the seed's palette and the stylesheet's tokens are the same colours", () => {
  for (const [name, hex] of Object.entries(PALETTE))
    expect(token(name === "grey" ? "muted" : name).toUpperCase()).toBe(hex);
});
