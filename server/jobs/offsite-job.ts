import type { Notifier, SentLog } from "../notify/notifier.ts";
import { offsiteAlert, readOffsiteStatus } from "../offsite-status.ts";
import { every, type Job } from "./scheduler.ts";

const CHECK_MS = 60 * 60 * 1000;

/** Reads `cave-offsite`'s status every hour and notifies once when it is stale or failed. */
export function createOffsiteJob({
  statusPath,
  notifier,
  sent,
}: {
  statusPath: string | undefined;
  notifier: Notifier;
  sent: SentLog;
}): Job {
  return {
    id: "offsite",
    label: "Off-box backup watch",
    describeSchedule: () => "checked every hour",
    nextRun: every(CHECK_MS),
    async run({ now }) {
      const status = readOffsiteStatus(statusPath);
      if (!status) return { result: "skipped", summary: "not set up", didSomething: false };
      const alert = offsiteAlert(status, now);
      if (!alert) return { result: "ok", summary: "fresh", didSomething: false };
      if (sent.wasSent(alert.key))
        return { result: "ok", summary: "already told", didSomething: false };
      // Titles only on every channel: no details, whatever the detail setting.
      const result = await notifier.notify({
        key: alert.key,
        kind: "message",
        title: alert.title,
        details: [],
        path: "/settings/system",
      });
      sent.markSent(alert.key, null, now, result);
      return { result: "ok", summary: alert.title, didSomething: true };
    },
  };
}
