import { INBOX, NOTES } from "./notes.ts";
import type { CollectionData } from "./schema.ts";
import type { Doc } from "./types.ts";

/**
 * The radar (M9 part B): what agents find for the owner, ranked by the owner's interests.
 * The Cave fetches nothing itself; agents add findings with `create`, under rules the agent
 * writer enforces (a safe URL, a reason, one item per URL, 50 a day).
 */

export const RADAR = "radar";
export const RADAR_PER_DAY = 50;

export const RADAR_COLLECTION: CollectionData = {
  name: "Radar",
  icon: "radar",
  color: "#3DE0FF",
  order: 13,
  fields: [
    { id: "url", name: "URL", type: "url" },
    { id: "source", name: "Source", type: "text" },
    { id: "interests", name: "Interests", type: "text" },
    { id: "why", name: "Why", type: "text" },
    { id: "found_at", name: "Found", type: "date", config: { withTime: true } },
    {
      id: "status",
      name: "Status",
      type: "select",
      options: [
        { value: "new", icon: "sparkle", color: "#3DE0FF" },
        { value: "saved", icon: "bookmark", color: "#B6FF3B" },
        { value: "dismissed", icon: "x", color: "#8C93A0" },
      ],
    },
    { id: "note", name: "Note", type: "ref", config: { collection: NOTES } },
  ],
  views: [{ id: "table", name: "Table", type: "table", config: {} }],
};

export interface Interest {
  name: string;
  keywords: string[];
}

export const DEFAULT_INTERESTS: Interest[] = [
  {
    name: "AI",
    keywords: [
      "ai",
      "llm",
      "gpt",
      "claude",
      "anthropic",
      "openai",
      "gemini",
      "model",
      "agent",
      "agents",
      "mcp",
    ],
  },
  { name: "Tech", keywords: [] },
  {
    name: "Minimalism",
    keywords: ["minimal", "minimalism", "minimalist", "declutter", "simplicity"],
  },
  {
    name: "Gaming",
    keywords: ["game", "games", "gaming", "steam", "nintendo", "playstation", "xbox", "emulator"],
  },
  {
    name: "Stocks",
    keywords: ["stock", "stocks", "market", "nasdaq", "earnings", "invest", "investing", "s&p"],
  },
  {
    name: "Crypto",
    keywords: ["crypto", "bitcoin", "btc", "ethereum", "blockchain", "stablecoin"],
  },
];

/** `settings.radarInterests`, read defensively; none at all means the defaults. */
export function interestsOf(settings: Record<string, unknown> | undefined): Interest[] {
  const raw = settings?.radarInterests;
  if (!Array.isArray(raw)) return DEFAULT_INTERESTS;
  return raw.flatMap((i) =>
    i && typeof i.name === "string" && i.name.trim()
      ? [
          {
            name: i.name.trim(),
            keywords: Array.isArray(i.keywords)
              ? i.keywords.filter(
                  (k: unknown): k is string => typeof k === "string" && k.trim() !== "",
                )
              : [],
          },
        ]
      : [],
  );
}

/** Interests as the Settings box shows them: one per line, `Name: keyword, keyword`. */
export function formatInterests(interests: Interest[]): string {
  return interests
    .map((i) => (i.keywords.length ? `${i.name}: ${i.keywords.join(", ")}` : i.name))
    .join("\n");
}

/** The Settings box read back; blank lines are skipped and keywords are lower-cased. */
export function parseInterests(source: string): Interest[] {
  return source.split("\n").flatMap((line) => {
    const at = line.indexOf(":");
    const name = (at < 0 ? line : line.slice(0, at)).trim();
    if (!name) return [];
    const keywords =
      at < 0
        ? []
        : line
            .slice(at + 1)
            .split(",")
            .map((k) => k.trim().toLowerCase())
            .filter(Boolean);
    return [{ name, keywords }];
  });
}

const text = (v: unknown) => (typeof v === "string" ? v : "");

/** The host a URL points to, without `www.`; "" when it isn't a URL. */
export function domainOf(url: unknown): string {
  try {
    return new URL(text(url)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** One finding per address: case-insensitive host, no trailing slash, no fragment. */
export function sameUrl(url: unknown): string {
  try {
    const u = new URL(text(url).trim());
    u.hash = "";
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return text(url).trim();
  }
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wholeWord = (keyword: string, haystack: string) =>
  new RegExp(`(^|[^a-z0-9])${escapeRegExp(keyword.toLowerCase())}($|[^a-z0-9])`).test(haystack);

/**
 * The interests an item matches: those its agent listed in `interests`, and those with a
 * keyword in its title or domain as a whole word, case-insensitively.
 */
export function matchedInterests(item: Doc, interests: Interest[]): string[] {
  const listed = new Set(
    text(item.data.interests)
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  const haystack =
    `${text(item.data._title)} ${domainOf(item.data.url).replace(/\./g, " ")}`.toLowerCase();
  return interests
    .filter(
      (i) => listed.has(i.name.toLowerCase()) || i.keywords.some((k) => wholeWord(k, haystack)),
    )
    .map((i) => i.name);
}

const live = (d: Doc) => d.data._deleted !== true;
const foundAt = (d: Doc) => text(d.data.found_at) || text(d.data._created);
const newestFirst = (a: Doc, b: Doc) =>
  foundAt(a) < foundAt(b) ? 1 : foundAt(a) > foundAt(b) ? -1 : 0;

/** The radar's tabs: For you (new and matching), All (new), Saved. */
export function radarTabs(items: Doc[], interests: Interest[]) {
  const fresh = items
    .filter((d) => live(d) && (d.data.status ?? "new") === "new")
    .sort(newestFirst);
  return {
    forYou: fresh.filter((d) => matchedInterests(d, interests).length > 0),
    all: fresh,
    saved: items.filter((d) => live(d) && d.data.status === "saved").sort(newestFirst),
  };
}

export interface RadarWrite {
  id: string;
  collection: string;
  patch: Record<string, unknown>;
}

/**
 * Saving a finding: a note in the Inbox (or on a project) with its address, its domain, the
 * agent's summary and an empty "My take", and the item marked saved and linked to the note.
 * An item already saved to a live note writes nothing; open that note instead.
 */
export function saveWrites(
  item: Doc,
  existingNote: Doc | undefined,
  newId: () => string,
  project?: string,
): RadarWrite[] {
  if (existingNote && existingNote.data._deleted !== true) return [];
  const note = newId();
  const summary = text(item.data._body).trim();
  const from = `From ${domainOf(item.data.url) || "the web"}.`;
  const body = [from, ...(summary ? [summary] : []), "## My take\n"].join("\n\n");
  return [
    {
      id: note,
      collection: NOTES,
      patch: {
        _title: text(item.data._title) || domainOf(item.data.url) || "Saved from the radar",
        _body: body,
        folder: INBOX,
        source: "radar",
        ...(typeof item.data.url === "string" ? { url: item.data.url } : {}),
        ...(project ? { project } : {}),
      },
    },
    { id: item.id, collection: RADAR, patch: { status: "saved", note } },
  ];
}

/** Seed migration 15: the radar collection and the default interests, where missing. */
export function radarMigration(
  get: (id: string) => Doc | undefined,
): { id: string; kind: "collection" | "setting"; data: Record<string, unknown> }[] {
  const out: { id: string; kind: "collection" | "setting"; data: Record<string, unknown> }[] = [];
  if (!get(RADAR)) out.push({ id: RADAR, kind: "collection", data: RADAR_COLLECTION });
  if (get("settings")?.data.radarInterests === undefined)
    out.push({ id: "settings", kind: "setting", data: { radarInterests: DEFAULT_INTERESTS } });
  return out;
}
