import { useEffect, useState } from "react";
import type { Status } from "../../../server/owner-api.ts";
import { TOKEN_KEY } from "../app/boot.ts";
import { useCave } from "../app/context.ts";
import { useReminderZone, useTimeZone } from "../app/hooks.ts";
import { ownerDownload, ownerGet } from "../app/owner-api.ts";
import { COMMIT_URL, deployLine } from "../logic/deploy-line.ts";
import { useDoc } from "../store/queries.ts";
import { DeviceNotifications, NotificationChannels } from "../ui/NotificationSettings.tsx";

const SETTINGS = { id: "settings", kind: "setting" as const, collection: null };

export function Settings() {
  const cave = useCave();
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");

  const save = () => {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    cave.syncNow();
  };

  return (
    <>
      <h1 style={{ margin: 0, fontSize: 32, letterSpacing: "-0.03em" }}>Settings</h1>
      <OwnerName />
      <ReminderTime />
      <DeviceNotifications />
      <NotificationChannels />
      <section className="panel" style={{ padding: 18, display: "grid", gap: 14, maxWidth: 560 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span className="k">Server token</span>
          <input
            className="input"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Only needed when the server sets CAVE_TOKEN"
          />
        </label>
        <div>
          <button type="button" className="btn primary" onClick={save}>
            Save and sync
          </button>
        </div>
        <div className="muted" style={{ fontSize: 13 }}>
          Device <span className="num">{cave.local.deviceId}</span>
        </div>
      </section>
      <ServerStatus />
    </>
  );
}

/** When a reminder with only a date is due; Part B's notifications will use it too. */
function ReminderTime() {
  const { local } = useCave();
  const zone = useReminderZone();
  return (
    <section className="panel" style={{ padding: 18, display: "grid", gap: 6, maxWidth: 560 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span className="k">Reminder time</span>
        <input
          key={zone.defaultTime}
          className="input"
          type="time"
          defaultValue={zone.defaultTime}
          onBlur={(e) => {
            const next = e.target.value;
            if (next && next !== zone.defaultTime)
              void local.write(SETTINGS, { reminderTime: next });
          }}
        />
      </label>
      <span className="muted" style={{ fontSize: 13 }}>
        For reminders with a date and no time, in {zone.timeZone}.
      </span>
    </section>
  );
}

function OwnerName() {
  const { local } = useCave();
  const stored = useDoc(local.db, "settings")?.data.ownerName;
  const name = typeof stored === "string" ? stored : "";
  return (
    <section className="panel" style={{ padding: 18, display: "grid", gap: 6, maxWidth: 560 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span className="k">Your name</span>
        <input
          // Remount when the stored name changes, e.g. from another device.
          key={name}
          className="input"
          defaultValue={name}
          placeholder="Used in the greeting"
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next !== name) void local.write(SETTINGS, { ownerName: next || null });
          }}
        />
      </label>
    </section>
  );
}

function ServerStatus() {
  const timeZone = useTimeZone();
  const [status, setStatus] = useState<Status | "offline">();
  const [exportFailed, setExportFailed] = useState(false);

  useEffect(() => {
    void ownerGet<Status>("/api/status").then((s) => setStatus(s ?? "offline"));
  }, []);

  const when = (iso: string) =>
    new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone }).format(
      new Date(iso),
    );

  return (
    <section className="panel" style={{ padding: 18, display: "grid", gap: 10, maxWidth: 560 }}>
      <span className="k">Server</span>
      {status === undefined && <span className="muted">Checking…</span>}
      {status === "offline" && (
        <span className="muted">Not reachable from this device right now.</span>
      )}
      {status !== undefined && status !== "offline" && (
        <dl
          style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", margin: 0 }}
        >
          <dt className="muted">Last backup</dt>
          <dd style={{ margin: 0 }}>
            {status.lastBackupAt ? when(status.lastBackupAt) : "None yet"}
          </dd>
          <dt className="muted">Database id</dt>
          <dd className="num" style={{ margin: 0, overflowWrap: "anywhere" }}>
            {status.dbId}
          </dd>
          <dt className="muted">Docs</dt>
          <dd className="num" style={{ margin: 0 }}>
            {status.docs}
          </dd>
          <dt className="muted">New vault notes</dt>
          <dd style={{ margin: 0 }}>
            {status.newVaultNotes === null
              ? "No vault set"
              : status.newVaultNotes === 0
                ? "None"
                : `${status.newVaultNotes}: run bun run import`}
          </dd>
          {status.deploy && (
            <>
              <dt className="muted">Deploy</dt>
              <dd style={{ margin: 0 }}>
                {deployLine(status.deploy, when).map((part, i) =>
                  typeof part === "string" ? (
                    part
                  ) : (
                    <a
                      // biome-ignore lint/suspicious/noArrayIndexKey: the parts never reorder
                      key={i}
                      className="num"
                      href={COMMIT_URL + part.commit}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {part.commit.slice(0, 7)}
                    </a>
                  ),
                )}
              </dd>
            </>
          )}
          <dt className="muted">Version</dt>
          <dd className="num" style={{ margin: 0 }}>
            {status.version}
            {status.commit ? ` · ${status.commit.slice(0, 7)}` : ""}
          </dd>
        </dl>
      )}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn"
          onClick={() => void ownerDownload("/api/export").then((ok) => setExportFailed(!ok))}
        >
          Download export
        </button>
        {exportFailed && <span className="muted">The server refused or could not be reached.</span>}
      </div>
    </section>
  );
}
