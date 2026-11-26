import { afterAll, expect, test } from "bun:test";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const hasGpg = Bun.which("gpg") !== null;
// carry.sh only runs on a laptop. A release build on the VPS (cave-deploy sets CAVE_ROOT) runs
// under systemd's sandbox, where tar can't create the unpacked folders, so it is skipped there.
const runs = hasGpg && process.env.CAVE_ROOT === undefined;
const tmp = mkdtempSync(join(tmpdir(), "cave-carry-"));
const gnupg = join(tmp, "gnupg");
const passphrase = join(tmp, "passphrase");

afterAll(() => {
  // gpg leaves an agent running for the test's GNUPGHOME.
  if (hasGpg && existsSync(gnupg)) {
    Bun.spawnSync(["gpgconf", "--kill", "gpg-agent"], { env: { ...process.env, GNUPGHOME: gnupg } });
  }
  rmSync(tmp, { recursive: true, force: true });
});

const write = (path: string, text: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

/** A home with a checkout at ~/code/jarvis holding a copy of the script. */
function machine(name: string) {
  const home = join(tmp, name);
  const root = join(home, "code", "jarvis");
  write(join(root, "setup", "carry.sh"), readFileSync(join(import.meta.dir, "carry.sh"), "utf8"));
  const memory = join(home, ".claude", "projects", root.replace(/[^A-Za-z0-9]/g, "-"), "memory");
  return { home, root, memory };
}

function carry(m: ReturnType<typeof machine>, args: string[], env: Record<string, string> = {}) {
  const result = Bun.spawnSync(["bash", join(m.root, "setup", "carry.sh"), ...args], {
    env: {
      PATH: process.env.PATH ?? "",
      HOME: m.home,
      GNUPGHOME: gnupg,
      CAVE_CARRY_PASSPHRASE_FILE: passphrase,
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = result.stdout.toString() + result.stderr.toString();
  if (!result.success) console.error(output);
  expect(result.success).toBe(true);
  return output;
}

test.skipIf(!runs)("carry: what the old laptop packs, the new one gets back, encrypted and without overwriting", () => {
  mkdirSync(gnupg, { mode: 0o700 });
  writeFileSync(passphrase, "correct horse battery staple\n");
  const old = machine("old");
  write(join(old.root, ".env"), "CAVE_REMOTE_TOKEN=remote-secret\n");
  write(join(old.root, "data", "dev.db"), "database");
  write(join(old.root, ".claude", "settings.local.json"), '{"permissions":{}}');
  write(join(old.home, ".ssh", "id_ed25519"), "private key");
  chmodSync(join(old.home, ".ssh", "id_ed25519"), 0o600);
  write(join(old.home, ".claude", "CLAUDE.md"), "old rules");
  write(join(old.memory, "MEMORY.md"), "- [Autonomy](autonomy.md)");
  const out = join(tmp, "usb");
  mkdirSync(out);
  // No keys file on the old machine: the keys come from the environment, as WSL passed them.
  carry(old, ["pack", out], { CAVE_AGENT_TOKEN: "agent-secret", EXA_API_KEY: "exa-secret" });

  const [file] = readdirSync(out);
  expect(file).toMatch(/^cave-carry-\d{4}-\d{2}-\d{2}\.tar\.gpg$/);
  const bytes = readFileSync(join(out, file as string), "latin1");
  for (const secret of ["remote-secret", "agent-secret", "private key"]) expect(bytes).not.toContain(secret);

  // The new checkout sits at another path, and the new machine already has its own Claude rules.
  const fresh = machine("new");
  write(join(fresh.home, ".claude", "CLAUDE.md"), "new rules");
  const output = carry(fresh, ["unpack", join(out, file as string)]);

  expect(readFileSync(join(fresh.root, ".env"), "utf8")).toBe("CAVE_REMOTE_TOKEN=remote-secret\n");
  expect(readFileSync(join(fresh.root, "data", "dev.db"), "utf8")).toBe("database");
  expect(existsSync(join(fresh.root, ".claude", "settings.local.json"))).toBe(true);
  expect(statSync(join(fresh.home, ".ssh", "id_ed25519")).mode & 0o777).toBe(0o600);
  expect(readFileSync(join(fresh.memory, "MEMORY.md"), "utf8")).toContain("Autonomy");
  const keys = readFileSync(join(fresh.home, ".config", "environment.d", "cave.conf"), "utf8");
  expect(keys).toContain("CAVE_AGENT_TOKEN=agent-secret\n");
  expect(keys).toContain("EXA_API_KEY=exa-secret\n");
  expect(keys).toContain("GITHUB_PAT=\n");
  expect(statSync(join(fresh.home, ".config", "environment.d", "cave.conf")).mode & 0o777).toBe(0o600);
  expect(readFileSync(join(fresh.home, ".claude", "CLAUDE.md"), "utf8")).toBe("new rules");
  expect(output).toContain(`kept existing ${join(fresh.home, ".claude", "CLAUDE.md")}`);
}, 60_000);
