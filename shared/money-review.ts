import type { OptionKind, SelectOption } from "./schema.ts";
import type { Doc } from "./types.ts";

/**
 * The category review (M7b part 5): deterministic rules over each entry's current category,
 * `detail` and title. A rule never guesses: an entry it can't place clearly keeps its category
 * or becomes uncategorized. Nothing here writes; the owner approves every change in the app.
 */

export interface Proposal {
  id: string;
  from: string | null;
  /** `null`: uncategorized. */
  to: string | null;
  rule: string;
  date: string;
  title: string;
  amount: number | null;
  direction: string | null;
}

interface Entry {
  category: string | null;
  direction: string | null;
  title: string;
  detail: string;
}

/** Lower case, no accents, one space: "Nómina  Oct" → "nomina oct". */
const norm = (s: unknown) =>
  typeof s === "string"
    ? s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim()
    : "";

const hasWord = (text: string, words: string[]) =>
  words.some((w) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, "u").test(text));

interface Rule {
  name: string;
  to: string;
  /** Current categories this rule may refine; `null` is uncategorized. Any other conflicts. */
  from: (string | null)[];
  when(e: Entry): boolean;
}

const income = (e: Entry) => e.direction === "income";
const expense = (e: Entry) => e.direction === "expense";

/** In order: the first rule that matches decides. */
const RULES: Rule[] = [
  {
    name: "income titled or detailed “vales”",
    to: "vales",
    from: [null, "income", "other_income"],
    when: (e) => income(e) && (hasWord(e.title, ["vales"]) || hasWord(e.detail, ["vales"])),
  },
  {
    name: "income with detail “salary” or a payroll title",
    to: "salary",
    from: [null, "income", "other_income"],
    when: (e) =>
      income(e) &&
      (hasWord(e.detail, ["salary"]) ||
        hasWord(e.title, ["salary", "nomina", "salario", "sueldo", "paycheck"])),
  },
  {
    name: "income titled or detailed “renta”",
    to: "rent_income",
    from: [null, "income", "other_income"],
    when: (e) => income(e) && (hasWord(e.title, ["renta"]) || hasWord(e.detail, ["renta"])),
  },
  {
    name: "detail “AI tools” or “Digital service”",
    to: "subscriptions",
    from: [null, "other", "fun", "home", "learning", "subscriptions"],
    when: (e) => expense(e) && /\b(ai tools|digital service)\b/.test(e.detail),
  },
  {
    name: "detail “Trip”",
    to: "travel",
    from: [null, "other", "fun", "transport", "travel"],
    when: (e) => expense(e) && hasWord(e.detail, ["trip"]),
  },
  {
    name: "detail “Snacks & treats” or a title “gula”",
    to: "gula",
    from: [null, "food", "fun", "other", "gula"],
    when: (e) =>
      expense(e) &&
      (/snacks( & | and )?treats|^snacks$/.test(e.detail) || hasWord(e.title, ["gula"])),
  },
  {
    name: "detail “Gym”",
    to: "health",
    from: [null, "health", "other", "fun"],
    when: (e) => expense(e) && hasWord(e.detail, ["gym"]),
  },
  {
    name: "title or detail “despensa” or “super”",
    to: "groceries",
    from: [null, "food", "home", "other", "groceries"],
    when: (e) =>
      expense(e) &&
      (hasWord(e.title, ["despensa", "super", "supermercado"]) ||
        hasWord(e.detail, ["despensa", "super", "supermercado", "groceries"])),
  },
];

/** Title words that only fit some categories: under any other, the entry is uncategorized. */
const HINTS: { words: string[]; fits: string[]; what: string }[] = [
  {
    what: "food",
    words: ["tacos", "taco", "pizza", "sushi", "burger", "hamburguesa", "comida", "restaurante"],
    fits: ["food", "gula", "groceries"],
  },
  {
    what: "a drink",
    words: ["mezcal", "cerveza", "cervezas", "beer", "vino", "wine", "tequila", "chelas"],
    fits: ["fun", "gula", "food", "groceries"],
  },
  {
    what: "a ride",
    words: ["uber", "didi", "taxi", "cabify", "gasolina", "metro", "scooter"],
    fits: ["transport", "travel", "shopping"],
  },
];

/** One entry's proposal, or `undefined` when it stays as it is. */
export function proposeFor(
  doc: Doc,
  options: readonly SelectOption[],
): Omit<Proposal, "id" | "date" | "title" | "amount" | "direction"> | undefined {
  const raw = doc.data.category;
  const category = typeof raw === "string" && raw ? raw : null;
  const e: Entry = {
    category,
    direction: typeof doc.data.direction === "string" ? doc.data.direction : null,
    title: norm(doc.data._title),
    detail: norm(doc.data.detail),
  };
  const known = new Set(options.map((o) => o.value));

  for (const rule of RULES) {
    if (!rule.when(e) || !known.has(rule.to)) continue;
    if (category === rule.to) return undefined;
    if (rule.from.includes(category)) return { from: category, to: rule.to, rule: rule.name };
    return {
      from: category,
      to: null,
      rule: `${rule.name} disagrees with “${category}”`,
    };
  }

  if (category === null) return undefined;
  const kind: OptionKind | undefined = options.find((o) => o.value === category)?.kind;
  if (kind && kind !== "transfer" && e.direction && kind !== e.direction)
    return { from: category, to: null, rule: `an ${kind} category on an ${e.direction} entry` };
  for (const hint of HINTS) {
    const word = hint.words.find((w) => hasWord(e.title, [w]));
    if (word && !hint.fits.includes(category))
      return {
        from: category,
        to: null,
        rule: `title “${word}” is ${hint.what}, not “${category}”`,
      };
  }
  return undefined;
}

/** Every live money entry's proposal. */
export function buildReview(docs: readonly Doc[], options: readonly SelectOption[]): Proposal[] {
  const proposals: Proposal[] = [];
  for (const doc of docs) {
    if (doc.kind !== "item" || doc.collection !== "money" || doc.data._deleted === true) continue;
    const p = proposeFor(doc, options);
    if (!p) continue;
    proposals.push({
      id: doc.id,
      ...p,
      date: typeof doc.data.date === "string" ? doc.data.date : "",
      title: typeof doc.data._title === "string" ? doc.data._title : "",
      amount: typeof doc.data.amount === "number" ? doc.data.amount : null,
      direction: typeof doc.data.direction === "string" ? doc.data.direction : null,
    });
  }
  return proposals.sort((a, b) => b.date.localeCompare(a.date));
}
