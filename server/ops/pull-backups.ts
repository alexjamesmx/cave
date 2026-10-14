import { existsSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { BACKUP_PATTERN, type Verified, verifyBackup } from "../backup.ts";

/** Backups on the VPS that the laptop does not have yet, oldest first. */
export function missingBackups(remote: string[], local: string[]): string[] {
  const have = new Set(local);
  return remote
    .map((name) => name.trim())
    .filter((name) => BACKUP_PATTERN.test(name) && !have.has(name))
    .sort();
}

export type Pulled =
  | { name: string; ok: true; docs: number }
  | { name: string; ok: false; error: string };

export interface PullOptions {
  remote: string[];
  dir: string;
  /** Copies one remote backup to a local path; true when the copy completed. */
  copy: (name: string, to: string) => boolean;
  verify?: (file: string) => Verified;
}

/**
 * Copies each missing backup to `<name>.part`, verifies it and only then gives it its real
 * name, so an interrupted copy is never taken for a backup. A copy that fails verification
 * is kept as `<name>.failed`. Nothing on the VPS is ever deleted from here.
 */
export function pullBackups({ remote, dir, copy, verify = verifyBackup }: PullOptions): Pulled[] {
  const local = existsSync(dir) ? readdirSync(dir) : [];
  return missingBackups(remote, local).map((name): Pulled => {
    const part = join(dir, `${name}.part`);
    if (!copy(name, part)) return { name, ok: false, error: "copy failed" };
    const verified = verify(part);
    if (!verified.ok) {
      renameSync(part, join(dir, `${name}.failed`));
      return { name, ok: false, error: verified.error };
    }
    renameSync(part, join(dir, name));
    return { name, ok: true, docs: verified.docs };
  });
}
