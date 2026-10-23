/**
 * Palette A (M11): the colours the seed gives collections, options and habits, and the
 * swatches the option editors offer. `web/src/styles.css` holds the same values as tokens;
 * `web/src/tokens.test.ts` keeps the two equal.
 */
export const PALETTE = {
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

/** A retired seed colour becomes its palette A colour; anything else is left as it is. */
export const recolour = (hex: unknown): unknown =>
  typeof hex === "string" ? (RETIRED[hex.toUpperCase()] ?? hex) : hex;
