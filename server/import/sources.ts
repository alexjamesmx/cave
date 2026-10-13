import { stat } from "node:fs/promises";
import { join } from "node:path";

export type SourceId = "ledger" | "tasks" | "journal" | "wealth" | "leetcode" | "projects";

interface Source {
  id: SourceId;
  collection: string;
  pattern: string;
}

// Only these globs are read, so `.obsidian/`, `System/` and the old emoji folders are never
// reached; dot-segments are dropped as well in case a `.trash` sits inside a source folder.
const SOURCES: Source[] = [
  { id: "ledger", collection: "money", pattern: "Money/Ledger/**/*.md" },
  { id: "tasks", collection: "tasks", pattern: "Tasks/*.md" },
  { id: "journal", collection: "journal", pattern: "Journal/*/*.md" },
  { id: "wealth", collection: "wealth", pattern: "Money/Wealth/*.md" },
  { id: "leetcode", collection: "leetcode", pattern: "Projects/LeetCode/*.md" },
  { id: "projects", collection: "projects", pattern: "Projects/*.md" },
];

export const CATEGORIES_PATH = "System/categories.json";

export const collectionOf = (source: SourceId) =>
  SOURCES.find((s) => s.id === source)?.collection as string;

export interface VaultNote {
  source: SourceId;
  /** Relative to the vault root, `/`-separated; the import id is derived from it. */
  path: string;
}

const isHidden = (path: string) => path.split("/").some((part) => part.startsWith("."));
const isYearFolder = (path: string) => /^Journal\/\d{4}\//.test(path);

export async function listNotes(root: string): Promise<VaultNote[]> {
  const notes: VaultNote[] = [];
  for (const source of SOURCES) {
    const glob = new Bun.Glob(source.pattern);
    for await (const raw of glob.scan({ cwd: root, onlyFiles: true, dot: false })) {
      const path = raw.replaceAll("\\", "/");
      if (isHidden(path)) continue;
      if (source.id === "journal" && !isYearFolder(path)) continue;
      notes.push({ source: source.id, path });
    }
  }
  return notes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Reads only; the importer never writes to the vault. */
export async function readVaultFile(
  root: string,
  path: string,
): Promise<{ text: string; createdMs: number }> {
  const full = join(root, path);
  const [text, info] = await Promise.all([Bun.file(full).text(), stat(full)]);
  // Some filesystems report no birth time; the last change is the closest honest value.
  return { text, createdMs: info.birthtimeMs > 0 ? info.birthtimeMs : info.mtimeMs };
}

export async function readCategoryNames(root: string): Promise<string[] | undefined> {
  const file = Bun.file(join(root, CATEGORIES_PATH));
  if (!(await file.exists())) return undefined;
  const parsed: unknown = await file.json();
  if (!Array.isArray(parsed)) throw new Error(`${CATEGORIES_PATH}: expected an array`);
  return parsed.flatMap((entry) =>
    typeof entry?.name === "string" && entry.name.trim() ? [entry.name.trim()] : [],
  );
}
