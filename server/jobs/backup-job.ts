import type { Database } from "bun:sqlite";
import { backupIfDue } from "../backup.ts";
import { every, type Job } from "./scheduler.ts";

const CHECK_MS = 60 * 60 * 1000;

/** The hourly check that takes the daily backup: the same behaviour, now a scheduler job. */
export function createBackupJob(db: Database, backupDir: string): Job {
  return {
    id: "backups",
    label: "Daily backup",
    describeSchedule: () => "checked every hour, one backup a day",
    nextRun: every(CHECK_MS),
    async run({ now }) {
      const result = backupIfDue(db, backupDir, now);
      if (!result) return { result: "skipped", summary: "not due", didSomething: false };
      if (result.ok) {
        console.log(`Backup ${result.file}: integrity ok, ${result.docs} docs`);
        return { result: "ok", summary: `${result.docs} docs`, didSomething: true };
      }
      console.error(`Backup failed: ${result.error}`);
      return { result: "failed", summary: "backup failed", didSomething: true };
    },
  };
}
