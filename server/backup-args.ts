export interface BackupArgs {
  /** Where the backup goes; the configured backup directory when absent. */
  dir?: string;
  /** Keep only the newest this many backups of the same kind in `dir`; daily retention when absent. */
  keep?: number;
  /** The commit about to be deployed: the backup is a pre-deploy one, named after it. */
  sha?: string;
}

export type Parsed = { ok: true; value: BackupArgs } | { ok: false; error: string };

export const BACKUP_USAGE = "Usage: bun run backup [--dir <path>] [--keep <n>] [--sha <commit>]";

/** `bun run backup` with no arguments keeps its old behaviour: a daily backup, daily retention. */
export function parseBackupArgs(argv: string[]): Parsed {
  const value: BackupArgs = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const arg = argv[i + 1];
    if (arg === undefined || arg.startsWith("--")) {
      return { ok: false, error: `${flag} needs a value` };
    }
    if (flag === "--dir") value.dir = arg;
    else if (flag === "--keep") {
      const keep = Number(arg);
      if (!Number.isInteger(keep) || keep < 1) {
        return { ok: false, error: `--keep must be a whole number of at least 1, got "${arg}"` };
      }
      value.keep = keep;
    } else if (flag === "--sha") {
      if (!/^[0-9a-f]{7,40}$/.test(arg)) {
        return { ok: false, error: `--sha must be a commit id, got "${arg}"` };
      }
      value.sha = arg;
    } else return { ok: false, error: `unknown argument "${flag}"` };
  }
  return { ok: true, value };
}
