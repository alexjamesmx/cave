import { useEffect, useState } from "react";
import type { Status } from "../../../server/owner-api.ts";
import { formatInterests, interestsOf, parseInterests } from "../../../shared/radar.ts";
import { currentProvider, PROVIDERS } from "../ai/providers.ts";
import { useCave } from "../app/context.ts";
import { useReminderZone, useTimeZone } from "../app/hooks.ts";
import { forgetDevice, lockDevice } from "../app/lock.ts";
import { ownerDownload, ownerGet } from "../app/owner-api.ts";
import { ownerOf } from "../app/sections.ts";
import { deployLine } from "../logic/deploy-line.ts";
import { offsiteLines } from "../logic/offsite-line.ts";
import { useCollections, useDoc } from "../store/queries.ts";
import { Icon } from "../ui/icon.tsx";
import { DeviceNotifications, NotificationChannels } from "../ui/NotificationSettings.tsx";
import { CollectionPage } from "./CollectionPage.tsx";

const SETTINGS = { id: "settings", kind: "setting" as const, collection: null };

/** Settings → General: who you are, when date-only reminders are due, and the AI in use. */
export function SettingsGeneral() {
  return (
    <>
      <OwnerName />
      <ReminderTime />
      <RadarInterests />
      <AiSettings />
    </>
  );
}

/** Settings → Notifications: this device's Web Push, and the channels. */
export function SettingsNotifications() {
  return (
    <>
      <DeviceNotifications />
      <NotificationChannels />
    </>
  );
}

/** Settings → Devices: this device's lock and its copy. */
export function SettingsDevices() {
  const cave = useCave();
  const forget = () => {
    if (
      confirm(
        "Forget this device? Its copy of the Cave and the offline files are deleted here; the server keeps everything. Changes not synced yet are lost.",
      )
    )
      void forgetDevice(() => cave.local.db.close());
  };
  return (
    <section className="panel" style={{ padding: 18, display: "grid", gap: 14, maxWidth: 560 }}>
      <span className="k">This device</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn" onClick={lockDevice}>
          Lock this device
        </button>
        <button type="button" className="btn" onClick={forget}>
          Forget this device
        </button>
      </div>
      <span className="muted" style={{ fontSize: 13 }}>
        Lock asks for the server token again and keeps this device's copy. Forget also deletes the
        copy and the offline files. Every device that synced lately is in Settings → System.
      </span>
      <div className="muted" style={{ fontSize: 13 }}>
        Device <span className="num">{cave.local.deviceId}</span>
      </div>
    </section>
  );
}

/**
 * Settings → Data: every collection, raw, with its views and the field editor; the server, the
 * backup and the export. `rest` opens one collection: `/settings/data/<id>/<view>`.
 */
export function SettingsData({ rest }: { rest: string[] }) {
  const { db } = useCave().local;
  const collections = useCollections(db) ?? [];
  const [id, view] = rest;
  if (id) return <CollectionPage key={id} id={id} viewId={view} />;
  return (
    <>
      <section className="panel" style={{ padding: 16, display: "grid", gap: 4 }}>
        <span className="k">Collections</span>
        {collections.map((c) => (
          <a
            key={c.id}
            className="entry"
            href={`/settings/data/${encodeURIComponent(c.id)}`}
            style={{ textDecoration: "none", color: "var(--text)" }}
          >
            <Icon name={c.data.icon} size={16} color={c.data.color} />
            <span style={{ flex: 1 }}>{c.data.name}</span>
            <span className="muted num" style={{ fontSize: 12 }}>
              {ownerOf(c.id)?.label ?? "Data only"}
            </span>
          </a>
        ))}
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

/** The radar's interests: the For you tab shows new findings that match one. */
function RadarInterests() {
  const { local } = useCave();
  const settings = useDoc(local.db, "settings");
  const text = formatInterests(interestsOf(settings?.data));
  return (
    <section className="panel" style={{ padding: 18, display: "grid", gap: 6, maxWidth: 560 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span className="k">Radar interests</span>
        <textarea
          key={text}
          className="input"
          rows={6}
          defaultValue={text}
          onBlur={(e) => {
            const next = parseInterests(e.target.value);
            if (formatInterests(next) !== text)
              void local.write(SETTINGS, { radarInterests: next });
          }}
        />
      </label>
      <span className="muted" style={{ fontSize: 13 }}>
        One per line, as Name: keyword, keyword. A finding matches when an agent tags it with the
        name or a keyword is a whole word of its title or domain.
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
          <dt className="muted">Off-box backup</dt>
          <dd style={{ margin: 0 }}>{offsiteLines(status.offsite, when).backup}</dd>
          <dt className="muted">Off-box check</dt>
          <dd style={{ margin: 0 }}>{offsiteLines(status.offsite, when).check}</dd>
          <dt className="muted">Database id</dt>
          <dd className="num" style={{ margin: 0, overflowWrap: "anywhere" }}>
            {status.dbId}
          </dd>
          <dt className="muted">Docs</dt>
          <dd className="num" style={{ margin: 0 }}>
            {status.docs}
          </dd>
          {status.deploy && (
            <>
              <dt className="muted">Deploy</dt>
              <dd style={{ margin: 0 }}>
                {deployLine(status.deploy, when).map((part, i) =>
                  typeof part === "string" ? (
                    part
                  ) : (
                    // The repository is private and its address isn't shipped in the app.
                    // biome-ignore lint/suspicious/noArrayIndexKey: the parts never reorder
                    <span key={i} className="num" title={part.commit}>
                      {part.commit.slice(0, 7)}
                    </span>
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

/** Which AI answers the Ask box; more providers come when the owner picks one. */
function AiSettings() {
  const provider = currentProvider();
  return (
    <section
      id="ai"
      className="panel"
      style={{ padding: 18, display: "grid", gap: 6, maxWidth: 560 }}
    >
      <span className="k">AI</span>
      <span>
        The Ask box uses <strong>{provider.label}</strong>: {provider.where.toLowerCase()}, with the
        question prefilled and copied. Claude reads and writes the Cave through its connector.
      </span>
      <span className="muted" style={{ fontSize: 13 }}>
        Available: {PROVIDERS.map((p) => p.label).join(", ")}. An API key, OpenAI-compatible models
        and Telegram come later. Rules, skills and tools are on <a href="/ai">the AI page</a>.
      </span>
    </section>
  );
}
