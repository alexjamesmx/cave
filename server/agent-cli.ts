import { createAgentRegistry } from "./agents.ts";
import { resolveConfig } from "./config.ts";
import { openDb } from "./db.ts";

const USAGE = `Usage:
  bun run agent add <name> --scopes read,write [--collections money,tasks]
  bun run agent list
  bun run agent revoke <name>`;

function option(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const config = resolveConfig(process.env);
if (!config.ok) fail(config.error);
const agents = createAgentRegistry(openDb(config.value.dbPath));
const [command, name, ...rest] = process.argv.slice(2);

if (command === "add" && name) {
  const scopes = option(rest, "--scopes");
  if (!scopes) fail(USAGE);
  const collections = option(rest, "--collections");
  const added = agents.add(
    name,
    scopes.split(","),
    collections ? collections.split(",") : null,
    Date.now(),
  );
  if (!added.ok) fail(added.error);
  // Printed once: only its hash is stored, so it cannot be shown again.
  console.log(`Agent ${name} added. Its token, shown only now:\n${added.value.token}`);
} else if (command === "list") {
  for (const a of agents.list()) {
    const where = a.collections ? a.collections.join(",") : "all collections";
    const state = a.revoked ? `revoked ${new Date(a.revoked).toISOString()}` : "active";
    console.log(`${a.name}  ${a.scopes.join(",")}  ${where}  ${state}`);
  }
} else if (command === "revoke" && name) {
  if (!agents.revoke(name, Date.now())) fail(`No active agent named ${name}`);
  console.log(`Agent ${name} revoked.`);
} else {
  fail(USAGE);
}
