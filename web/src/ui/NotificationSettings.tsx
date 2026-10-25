import { useCallback, useEffect, useState } from "react";
import {
  type ChannelId,
  type Detail,
  type NotificationSettings,
  notificationSettings,
} from "../../../shared/notifications.ts";
import { useCave } from "../app/context.ts";
import { ownerGet, ownerPost } from "../app/owner-api.ts";
import { deviceLabel, needsHomeScreen } from "../logic/device-label.ts";
import { useDoc } from "../store/queries.ts";

const SETTINGS = { id: "settings", kind: "setting" as const, collection: null };

interface ChannelRow {
  id: ChannelId;
  label: string;
  status: { ready: boolean; summary: string };
}
interface Overview {
  channels: ChannelRow[];
  missed: number;
  telegram: { linked: boolean };
}
interface PushInfo {
  enabled: boolean;
  publicKey: string | null;
  devices: { label: string; created_at: number; last_ok_at: number | null; this: boolean }[];
}

const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString() : "never");

/** Every channel, what it needs, whether it's a default and how much it's told. */
export function NotificationChannels() {
  const { local } = useCave();
  const stored = useDoc(local.db, "settings")?.data;
  const config = notificationSettings(stored);
  const [overview, setOverview] = useState<Overview | "offline">();
  const [note, setNote] = useState<string>();
  const [link, setLink] = useState<{ code: string; expiresAt: number; bot?: string }>();

  const load = useCallback(
    () => void ownerGet<Overview>("/api/notifications").then((o) => setOverview(o ?? "offline")),
    [],
  );
  useEffect(load, [load]);

  const save = (next: NotificationSettings) => void local.write(SETTINGS, { notifications: next });
  const toggle = (id: ChannelId, on: boolean) =>
    save({
      ...config,
      channels: on ? [...config.channels, id] : config.channels.filter((c) => c !== id),
    });
  const setDetail = (id: ChannelId, detail: Detail) =>
    save({ ...config, detail: { ...config.detail, [id]: detail } });
  const test = async (channel: ChannelId) => {
    const r = await ownerPost<{ delivered: number; failed: number }>("/api/notifications/test", {
      channel,
    });
    setNote(
      r
        ? `Test: ${r.delivered} delivered, ${r.failed} failed`
        : "The server refused or could not be reached.",
    );
    load();
  };

  return (
    <section className="panel" style={{ padding: 18, display: "grid", gap: 12, maxWidth: 560 }}>
      <span className="k">Notifications and integrations</span>
      {overview === undefined && <span className="muted">Checking…</span>}
      {overview === "offline" && <span className="muted">Needs the server.</span>}
      {overview !== undefined && overview !== "offline" && (
        <>
          {overview.channels.map((c) => (
            <div key={c.id} className="channel-row">
              <strong>{c.label}</strong>
              <span className={c.status.ready ? "muted" : "error"}>{c.status.summary}</span>
              <label className="muted">
                <input
                  type="checkbox"
                  checked={config.channels.includes(c.id)}
                  onChange={(e) => toggle(c.id, e.target.checked)}
                />{" "}
                default
              </label>
              <select
                className="input"
                aria-label={`${c.label} detail`}
                value={config.detail[c.id]}
                onChange={(e) => setDetail(c.id, e.target.value as Detail)}
              >
                <option value="titles">Titles only</option>
                <option value="full">Full detail</option>
              </select>
              <button
                type="button"
                className="btn"
                disabled={!c.status.ready}
                onClick={() => void test(c.id)}
              >
                Send test
              </button>
              {c.id === "telegram" && c.status.summary !== "needs a bot token" && (
                <span style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {overview.telegram.linked ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void ownerPost("/api/telegram/unlink", {}).then(load)}
                    >
                      Unlink
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        void ownerPost<{ code: string; expiresAt: number; bot?: string }>(
                          "/api/telegram/link",
                          {},
                        ).then((l) => l && setLink(l))
                      }
                    >
                      Link
                    </button>
                  )}
                  <label className="muted">
                    <input
                      type="checkbox"
                      checked={config.telegramApprovals}
                      onChange={(e) => save({ ...config, telegramApprovals: e.target.checked })}
                    />{" "}
                    Approve flows from Telegram
                  </label>
                </span>
              )}
            </div>
          ))}
          {link && (
            <p className="muted" style={{ margin: 0 }}>
              Send <span className="num">/start {link.code}</span> to{" "}
              {link.bot ? `@${link.bot}` : "your bot"} within 10 minutes, then reload this page.
            </p>
          )}
          <div className="channel-row">
            <strong>Daily digest</strong>
            <span className="muted">
              One email a day: questions and blocked parts, what is due, payments, the budget.
            </span>
            <input
              className="input"
              type="time"
              aria-label="Digest time"
              value={config.digest ?? ""}
              onChange={(e) => {
                const { digest: _, ...rest } = config;
                save(e.target.value ? { ...rest, digest: e.target.value } : rest);
              }}
              style={{ width: "auto" }}
            />
          </div>
          <div className="channel-row">
            <strong>Calendar</strong>
            <span className="muted">Reminders and Tasks are built in; flows arrive later.</span>
          </div>
          {overview.missed > 0 && (
            <span className="muted">
              {overview.missed} reminders were missed while the server was down (over 6 hours late),
              so they weren't sent.
            </span>
          )}
          {config.channels.some((c) => c === "telegram" || c === "discord") && (
            <span className="muted" style={{ fontSize: 13 }}>
              Telegram and Discord can read what they carry; “Titles only” keeps amounts, times and
              notes out of them. Email goes to your own inbox.
            </span>
          )}
          {note && <span className="muted">{note}</span>}
        </>
      )}
    </section>
  );
}

const urlKey = (base64url: string) => {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Web Push for this browser: enable, test, disable, and the other devices. */
export function DeviceNotifications() {
  const { local } = useCave();
  const [info, setInfo] = useState<PushInfo | "offline">();
  const [subscribed, setSubscribed] = useState<PushSubscription | null>(null);
  const [note, setNote] = useState<string>();
  const supported =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const standalone =
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true;

  const load = useCallback(async () => {
    setInfo(
      (await ownerGet<PushInfo>(`/api/push?deviceId=${encodeURIComponent(local.deviceId)}`)) ??
        "offline",
    );
    if (supported) {
      const registration = await navigator.serviceWorker.getRegistration();
      setSubscribed((await registration?.pushManager.getSubscription()) ?? null);
    }
  }, [local.deviceId, supported]);
  useEffect(() => void load(), [load]);

  // Subscribing inside the click is what lets iOS ask for permission.
  const enable = async (publicKey: string) => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlKey(publicKey),
      });
      const ok = await ownerPost("/api/push/subscribe", {
        subscription: subscription.toJSON(),
        deviceId: local.deviceId,
        label: deviceLabel(navigator.userAgent),
      });
      setNote(
        ok ? "Notifications are on for this device." : "The server refused the subscription.",
      );
    } catch (error) {
      setNote(`Not enabled: ${(error as Error).message}`);
    }
    await load();
  };
  const disable = async () => {
    if (subscribed) {
      await ownerPost("/api/push/unsubscribe", { endpoint: subscribed.endpoint });
      await subscribed.unsubscribe();
    }
    setNote("Notifications are off for this device.");
    await load();
  };
  const test = async () => {
    const r = await ownerPost<{ delivered: number; failed: number }>("/api/push/test", {
      deviceId: local.deviceId,
    });
    setNote(
      r
        ? `Test: ${r.delivered} delivered, ${r.failed} failed`
        : "The server refused or could not be reached.",
    );
  };

  return (
    <section className="panel" style={{ padding: 18, display: "grid", gap: 10, maxWidth: 560 }}>
      <span className="k">Notifications on this device</span>
      {needsHomeScreen(navigator.userAgent, standalone) ? (
        <span className="muted">
          On iPhone, add the Cave to your Home Screen and enable notifications from there.
        </span>
      ) : !supported ? (
        <span className="muted">This browser can't receive push notifications.</span>
      ) : info === "offline" ? (
        <span className="muted">Needs the server.</span>
      ) : info && !info.enabled ? (
        <span className="muted">Push is off on the server: it needs its VAPID keys.</span>
      ) : info?.publicKey ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="muted">{subscribed ? "On for this device" : "Off for this device"}</span>
          {subscribed ? (
            <>
              <button type="button" className="btn" onClick={() => void test()}>
                Send test
              </button>
              <button type="button" className="btn" onClick={() => void disable()}>
                Disable
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn primary"
              onClick={() => void enable(info.publicKey as string)}
            >
              Enable notifications
            </button>
          )}
        </div>
      ) : (
        <span className="muted">Checking…</span>
      )}
      {info && info !== "offline" && info.devices.length > 0 && (
        <ul className="agenda-list">
          {info.devices.map((d) => (
            <li key={`${d.label}-${d.created_at}`} className="muted">
              {d.label}
              {d.this ? " (this device)" : ""} · last delivered {when(d.last_ok_at)}
            </li>
          ))}
        </ul>
      )}
      {note && <span className="muted">{note}</span>}
    </section>
  );
}
