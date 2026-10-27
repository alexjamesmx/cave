import { useMemo } from "react";
import { FLOWS } from "../../../../shared/flows/seed.ts";
import { useCave } from "../../app/context.ts";
import { useNow, useReminderZone } from "../../app/hooks.ts";
import { forgetDevice, lockDevice } from "../../app/lock.ts";
import { offsiteLines } from "../../logic/offsite-line.ts";
import {
  flowEntries,
  jobEntries,
  mergeSchedule,
  reminderEntries,
  SCHEDULE_DAYS,
} from "../../logic/system.ts";
import { useItems } from "../../store/queries.ts";
import {
  isoWhen,
  Offline,
  Panel,
  Row,
  type Server,
  SubTabs,
  short,
  useSystemReport,
  when,
} from "./shared.tsx";

const TABS = [
  ["overview", "Overview"],
  ["schedules", "Schedules"],
  ["jobs", "Jobs"],
  ["notifications", "Notifications"],
] as const;
type Tab = (typeof TABS)[number][0];

/**
 * Settings → Devices & server: this device, the other devices, the server and what it runs.
 * Counts come from this device's copy; the server's parts say "offline" when it can't be reached.
 */
export function SettingsDevices({ tab }: { tab: string | undefined }) {
  const current: Tab = TABS.some(([id]) => id === tab) ? (tab as Tab) : "overview";
  const { server, reload } = useSystemReport();
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <SubTabs label="Devices sections" base="/settings/devices" tabs={TABS} current={current} />
        <button type="button" className="btn" style={{ marginLeft: "auto" }} onClick={reload}>
          Refresh
        </button>
      </div>
      {current === "overview" && <Overview server={server} />}
      {current === "schedules" && <Schedules server={server} />}
      {current === "jobs" && <Jobs server={server} />}
      {current === "notifications" && <Notifications server={server} />}
    </>
  );
}

function Overview({ server }: { server: Server }) {
  return (
    <>
      <ThisDevice />
      <Panel title="Devices · last 30 days">
        {server === "offline" && <Offline what="Devices" />}
        {typeof server === "object" &&
          (server.devices.length === 0 ? (
            <span className="muted">No device synced yet.</span>
          ) : (
            server.devices.map((d) => (
              <Row key={d.id}>
                <span>{d.label ?? "Unnamed device"}</span>
                <span className="num muted">{d.id.slice(0, 8)}</span>
                <span className="muted">{when(d.lastSeen)}</span>
              </Row>
            ))
          ))}
      </Panel>
      <Panel title="Server">
        {server === "offline" && <Offline what="Server details" />}
        {typeof server === "object" && (
          <>
            <Row>
              <span>Running</span>
              <span className="num">
                {server.version} · {short(server.commit)}
              </span>
            </Row>
            <Row>
              <span>Last deploy</span>
              <span className="num">
                {server.deploy
                  ? `${server.deploy.result}${server.deploy.step ? ` (${server.deploy.step})` : ""} · ${short(server.deploy.sha)} · ${isoWhen(server.deploy.at)}`
                  : "none recorded"}
              </span>
            </Row>
            <Row>
              <span>Last backup</span>
              <span className="num">{when(server.lastBackupAt)}</span>
            </Row>
            <Row>
              <span>Off-box backup</span>
              <span className="num">{offsiteLines(server.offsite, isoWhen).backup}</span>
            </Row>
            <Row>
              <span>Off-box check</span>
              <span className="num">{offsiteLines(server.offsite, isoWhen).check}</span>
            </Row>
          </>
        )}
      </Panel>
      <Panel title="Integrations">
        {server === "offline" && <Offline what="Integrations" />}
        {typeof server === "object" &&
          server.integrations.map((i) => (
            <Row key={i.id}>
              <span>{i.label}</span>
              <span
                className="chip"
                style={{ background: "var(--on)", color: i.ready ? "var(--ok)" : "var(--warn)" }}
              >
                {i.ready ? "ready" : "not ready"}
              </span>
              <span className="muted">{i.summary}</span>
            </Row>
          ))}
      </Panel>
    </>
  );
}

function ThisDevice() {
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
    <Panel title="This device">
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
        copy and the offline files.
      </span>
      <div className="muted" style={{ fontSize: 13 }}>
        Device <span className="num">{cave.local.deviceId}</span>
      </div>
    </Panel>
  );
}

function Schedules({ server }: { server: Server }) {
  const { db } = useCave().local;
  const reminders = useItems(db, "reminders");
  const flows = useItems(db, FLOWS);
  const zone = useReminderZone();
  const now = useNow().getTime();
  const entries = useMemo(() => {
    const to = now + SCHEDULE_DAYS * 24 * 60 * 60 * 1000;
    return mergeSchedule(
      reminderEntries(reminders ?? [], zone, now, to),
      flowEntries(flows ?? [], zone, now, to),
      typeof server === "object" ? jobEntries(server.jobs, server.deployNextAt, now) : [],
    );
  }, [reminders, flows, zone, now, server]);
  return (
    <Panel title={`Next ${SCHEDULE_DAYS} days`}>
      {server === "offline" && <Offline what="Job times" />}
      {entries.length === 0 && <span className="muted">Nothing scheduled.</span>}
      {entries.map((e) => (
        <Row key={e.key}>
          <span className="num">
            {e.approximate ? "≈ " : ""}
            {when(e.at)}
          </span>
          <span className="chip" style={{ background: "var(--on)" }}>
            {e.kind}
          </span>
          <a className="link" href={e.path}>
            {e.label}
          </a>
        </Row>
      ))}
    </Panel>
  );
}

function Jobs({ server }: { server: Server }) {
  if (server === "offline") return <Offline what="Jobs" />;
  if (!server) return null;
  return (
    <>
      <Panel title="Jobs">
        {server.jobs.map((j) => (
          <Row key={j.id}>
            <strong>{j.label}</strong>
            <span className="muted">{j.schedule}</span>
            <span className="muted">last {when(j.lastRun)}</span>
            <span className="muted">next {when(j.nextRun)}</span>
            <span>{j.lastResult ? `${j.lastResult} · ${j.lastSummary ?? ""}` : "not run yet"}</span>
          </Row>
        ))}
        <Row>
          <strong>Deploy (on the VPS)</strong>
          <span className="muted">about every 2 minutes</span>
          <span className="muted">
            {server.deploy ? `last ${isoWhen(server.deploy.at)}` : "no status"}
          </span>
          <span className="muted">≈ next {when(server.deployNextAt)}</span>
          <span>{server.deploy?.result ?? "—"}</span>
        </Row>
      </Panel>
      <Panel title="Recent runs">
        {server.jobRuns.length === 0 && <span className="muted">No recorded runs yet.</span>}
        {server.jobRuns.map((r) => (
          <Row key={`${r.job}-${r.startedAt}`}>
            <span className="num muted">{when(r.startedAt)}</span>
            <span>{r.job}</span>
            <span>{r.result}</span>
            <span className="muted">{r.summary}</span>
          </Row>
        ))}
      </Panel>
    </>
  );
}

function Notifications({ server }: { server: Server }) {
  if (server === "offline") return <Offline what="Notifications" />;
  if (!server) return null;
  const outbox = server.notifications.log.filter((n) => n.result === "outbox");
  return (
    <>
      {server.env !== "production" && (
        <Panel title="Dev outbox">
          <span className="muted">
            CAVE_ENV={server.env}: these would have gone out in production; nothing was sent
          </span>
          {outbox.length === 0 && <span className="muted">Nothing in the outbox yet.</span>}
          {outbox.map((n, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: one send can log the same key per channel
            <Row key={`${n.key}-${n.channel}-${i}`}>
              <span className="num muted">{when(n.at)}</span>
              <span>{n.channel}</span>
              <span className="num">{n.key}</span>
            </Row>
          ))}
        </Panel>
      )}
      <Panel title="Notification log">
        <span className="muted">Titles are never stored.</span>
        {server.notifications.log.length === 0 && <span className="muted">Nothing sent yet.</span>}
        {server.notifications.log.map((n, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: one send can log the same key per channel
          <Row key={`${n.key}-${n.channel}-${i}`}>
            <span className="num muted">{when(n.at)}</span>
            <span>{n.channel}</span>
            <span className="num">{n.key}</span>
            <span>{n.result}</span>
          </Row>
        ))}
      </Panel>
    </>
  );
}
