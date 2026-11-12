/**
 * The vivid palette (M14): the colours the seed gives collections, options and habits, and the
 * swatches every colour picker offers. `web/src/styles.css` holds the same values as tokens;
 * `web/src/tokens.test.ts` keeps the two equal.
 */
export const PALETTE = {
  ok: "#3DDC97",
  warn: "#F5B94A",
  wait: "#60A5FA",
  bad: "#FF8A94",
  vio: "#A78BFA",
  teal: "#2DD4BF",
  orange: "#FF8A4C",
  purple: "#E879F9",
  grey: "#8B93A1",
} as const;

/** The sixteen swatches a category, a topic or a habit can wear, in picker order. */
export const SWATCHES = {
  orange: "#FF8A4C",
  amber: "#F59E0B",
  yellow: "#FACC15",
  lime: "#A3E635",
  green: "#34D399",
  teal: "#2DD4BF",
  cyan: "#22D3EE",
  sky: "#38BDF8",
  blue: "#60A5FA",
  indigo: "#818CF8",
  violet: "#A78BFA",
  fuchsia: "#E879F9",
  pink: "#F472B6",
  rose: "#FB7185",
  red: "#F87171",
  grey: "#8B93A1",
} as const;

/** Palette A (M11 to M13), which seed migration 25 turns into the vivid palette. */
export const PALETTE_A = {
  ok: "#8FD0A0",
  warn: "#D9B56F",
  wait: "#8CB7DD",
  bad: "#E59AA4",
  vio: "#A39BE0",
  teal: "#7FC4CF",
  orange: "#D9A06F",
  purple: "#C9A3E0",
  grey: "#98A0AB",
} as const;

/** The seed's colours before M11 and what each became; seed migration 17 applies this. */
export const RETIRED: Record<string, string> = {
  "#B6FF3B": PALETTE.ok,
  "#2EE6A6": PALETTE.ok,
  "#FF5C7A": PALETTE.bad,
  "#3DE0FF": PALETTE.teal,
  "#8B7CFF": PALETTE.vio,
  "#F5C451": PALETTE.warn,
  "#FF9F43": PALETTE.orange,
  "#C77DFF": PALETTE.purple,
  "#8C93A0": PALETTE.grey,
};

/** Each palette A colour and the vivid colour of the same name. */
export const VIVID: Record<string, string> = Object.fromEntries(
  (Object.keys(PALETTE_A) as (keyof typeof PALETTE_A)[]).map((k) => [PALETTE_A[k], PALETTE[k]]),
);

/** A colour from `map` (keys upper case) or the colour as it is; non-strings pass through. */
const through =
  (map: Record<string, string>) =>
  (hex: unknown): unknown =>
    typeof hex === "string" ? (map[hex.toUpperCase()] ?? hex) : hex;

/** A retired seed colour becomes its palette colour; anything else is left as it is. */
export const recolour = through(RETIRED);

/** A palette A colour becomes its vivid colour; anything else is left as it is. */
export const vivify = through(VIVID);
