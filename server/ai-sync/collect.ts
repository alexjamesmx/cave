import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { redactFile, redactValue } from "./redact.ts";

/** One thing an AI knows or uses, read from a file and already redacted. */
export interface AiItem {
  /** `repo:<path>`, `~/<path>`, `<file>#<name>` for one entry of a file, or `cave:agents/<name>`. */
  source: string;
  title: string;
  kind: string;
  surface: string;
  scope: string;
  body: string;
}

export interface Roots {
  /** The repository's root. */
  repo: string;
  /** The user's home; Claude Code's files are under `.claude`. */
  home: string;
}

const read = (path: string) =>
  existsSync(path) && statSync(path).isFile() ? readFileSync(path, "utf8") : undefined;

/** `SKILL.md` files under `dir`, a few levels down (skills live in their own folders). */
function skillFiles(dir: string, depth = 3): string[] {
  if (!existsSync(dir) || depth < 0) return [];
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (!statSync(path).isDirectory()) continue;
    if (existsSync(join(path, "SKILL.md"))) found.push(join(path, "SKILL.md"));
    else found.push(...skillFiles(path, depth - 1));
  }
  return found;
}

/** The skill's `name:` from its front matter, else its folder. */
function skillName(path: string, text: string): string {
  return /^name:\s*(.+)$/m.exec(text)?.[1]?.trim() || basename(dirname(path));
}

function file(
  source: string,
  path: string,
  kind: string,
  surface: string,
  scope: string,
  title?: string,
): AiItem[] {
  const text = read(path);
  if (text === undefined) return [];
  return [
    {
      source,
      title: title ?? source.replace(/^repo:|^~\//, ""),
      kind,
      surface,
      scope,
      body: redactFile(path, text),
    },
  ];
}

/** Each MCP server in a `.mcp.json`, as its own item. */
function mcpServers(source: string, path: string, scope: string): AiItem[] {
  const text = read(path);
  if (text === undefined) return [];
  let servers: Record<string, unknown> = {};
  try {
    servers = (JSON.parse(text) as { mcpServers?: Record<string, unknown> }).mcpServers ?? {};
  } catch {
    return [];
  }
  return Object.entries(servers).map(([name, config]) => ({
    source: `${source}#${name}`,
    title: name,
    kind: "mcp-server",
    surface: "claude-code",
    scope,
    body: `${JSON.stringify(redactValue(config), null, 2)}\n`,
  }));
}

/** Installed plugins, from Claude Code's own list: the manifest and what the plugin ships. */
function plugins(home: string): AiItem[] {
  const list = read(join(home, ".claude", "plugins", "installed_plugins.json"));
  if (!list) return [];
  let installed: Record<string, { installPath?: string; version?: string }[]> = {};
  try {
    installed = (JSON.parse(list) as { plugins?: typeof installed }).plugins ?? {};
  } catch {
    return [];
  }
  return Object.entries(installed).flatMap(([id, entries]) => {
    const entry = entries.at(-1);
    if (!entry?.installPath) return [];
    const manifest = read(join(entry.installPath, ".claude-plugin", "plugin.json"));
    const skills = skillFiles(join(entry.installPath, "skills")).map((p) => basename(dirname(p)));
    const parts = [
      manifest ? redactFile("plugin.json", manifest).trim() : "{}",
      skills.length ? `\nSkills: ${skills.join(", ")}` : "",
    ];
    return [
      {
        source: `~/.claude/plugins/${id}`,
        title: id,
        kind: "plugin",
        surface: "claude-code",
        scope: "user",
        body: `${parts.join("\n")}\n`,
      },
    ];
  });
}

/** Everything `ai-sync` reads from the repository and the user's Claude Code home. */
export function collectAi({ repo, home }: Roots): AiItem[] {
  const claude = join(home, ".claude");
  const memory = join(claude, "projects");
  return [
    ...file("repo:AGENTS.md", join(repo, "AGENTS.md"), "rule", "any", "repo"),
    ...file("repo:CLAUDE.md", join(repo, "CLAUDE.md"), "rule", "claude-code", "repo"),
    ...file(
      "repo:.claude/settings.json",
      join(repo, ".claude", "settings.json"),
      "rule",
      "claude-code",
      "repo",
    ),
    ...mcpServers("repo:.mcp.json", join(repo, ".mcp.json"), "repo"),
    ...skillFiles(join(repo, ".claude", "skills")).flatMap((p) => {
      const rel = p.slice(repo.length + 1).replaceAll("\\", "/");
      const text = read(p) ?? "";
      return file(`repo:${rel}`, p, "skill", "claude-code", "repo", skillName(p, text));
    }),
    ...file("~/.claude/CLAUDE.md", join(claude, "CLAUDE.md"), "rule", "claude-code", "user"),
    ...file(
      "~/.claude/settings.json",
      join(claude, "settings.json"),
      "rule",
      "claude-code",
      "user",
    ),
    ...skillFiles(join(claude, "skills")).flatMap((p) => {
      const rel = p.slice(home.length + 1).replaceAll("\\", "/");
      const text = read(p) ?? "";
      return file(`~/${rel}`, p, "skill", "claude-code", "user", skillName(p, text));
    }),
    ...plugins(home),
    ...(existsSync(memory)
      ? readdirSync(memory).flatMap((project) => {
          const dir = join(memory, project, "memory");
          if (!existsSync(dir)) return [];
          return readdirSync(dir)
            .filter((n) => n.endsWith(".md"))
            .flatMap((n) =>
              file(
                `~/.claude/projects/${project}/memory/${n}`,
                join(dir, n),
                "memory",
                "claude-code",
                "user",
                `${project.split("-").at(-1)}: ${n}`,
              ),
            );
        })
      : []),
  ];
}

/**
 * Where a file source lives on this machine; `undefined` for entries inside a file, the Cave,
 * plugins, and anything that would land outside the repository or `~/.claude`.
 */
export function pathOf(source: string, { repo, home }: Roots): string | undefined {
  if (source.includes("#") || source.startsWith("cave:") || source === "manual") return undefined;
  const rel = source.startsWith("repo:")
    ? source.slice(5)
    : source.startsWith("~/")
      ? source.slice(2)
      : undefined;
  if (rel === undefined || rel.split(/[\\/]/).includes("..")) return undefined;
  // A plugin's source names the plugin, not a file to write.
  if (source.startsWith("~/") && rel.startsWith(".claude/plugins/")) return undefined;
  const root = resolve(source.startsWith("repo:") ? repo : join(home, ".claude"));
  const path = resolve(source.startsWith("repo:") ? repo : home, rel);
  return path.startsWith(root + sep) ? path : undefined;
}
