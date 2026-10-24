import type { ReactNode } from "react";
import { formatInterests, interestsOf, parseInterests } from "../../../../shared/radar.ts";
import { useCave } from "../../app/context.ts";
import { useReminderZone } from "../../app/hooks.ts";
import { dockOf, LANDING, SECTIONS } from "../../app/sections.ts";
import { useDoc } from "../../store/queries.ts";
import { EditDock } from "../../ui/Dock.tsx";
import { SETTINGS } from "./shared.tsx";

/** One theme for now; a light one is one more entry here. */
const THEMES = [{ id: "graphite", label: "Graphite" }];

/** `settings.motion`: animate (the Scene, transitions) always, or only when the OS allows it. */
const MOTION = [
  { id: "on", label: "On" },
  { id: "system", label: "Follow the system setting" },
];

/** Settings → General: who you are, your goal, time, look and the phone dock. */
export function SettingsGeneral() {
  return (
    <>
      <OwnerName />
      <Goal />
      <TimeZone />
      <ReminderTime />
      <Look />
      <PhoneDock />
      <RadarInterests />
    </>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <section className="panel" style={{ padding: 18, display: "grid", gap: 8, maxWidth: 560 }}>
      {children}
    </section>
  );
}

/** A settings key as text; `""` when unset or not a string. */
function useText(key: string): string {
  const stored = useDoc(useCave().local.db, "settings")?.data[key];
  return typeof stored === "string" ? stored : "";
}

function OwnerName() {
  const { local } = useCave();
  const name = useText("ownerName");
  return (
    <Panel>
      <label style={{ display: "grid", gap: 6 }}>
        <span className="k">Your name</span>
        <input
          // Remount when the stored name changes, e.g. from another device.
          key={name}
          className="input"
          defaultValue={name}
          placeholder="At the centre of the Scene"
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next !== name) void local.write(SETTINGS, { ownerName: next || null });
          }}
        />
      </label>
    </Panel>
  );
}

function Goal() {
  const { local } = useCave();
  const goal = useText("goal");
  return (
    <Panel>
      <label style={{ display: "grid", gap: 6 }}>
        <span className="k">Goal</span>
        <input
          key={goal}
          className="input"
          defaultValue={goal}
          placeholder="One line, under your name in the Scene"
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next !== goal) void local.write(SETTINGS, { goal: next || null });
          }}
        />
      </label>
    </Panel>
  );
}

const zones = (): string[] =>
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];

const isZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

/** Reminders, the calendar and the daily brief resolve local dates through this zone. */
function TimeZone() {
  const { local } = useCave();
  const stored = useText("timezone");
  const { timeZone } = useReminderZone();
  return (
    <Panel>
      <label style={{ display: "grid", gap: 6 }}>
        <span className="k">Time zone</span>
        <input
          key={stored}
          className="input"
          list="time-zones"
          defaultValue={stored}
          placeholder={timeZone}
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next === stored) return;
            if (!next) void local.write(SETTINGS, { timezone: null });
            else if (isZone(next)) void local.write(SETTINGS, { timezone: next });
            else e.target.value = stored;
          }}
        />
      </label>
      <datalist id="time-zones">
        {zones().map((z) => (
          <option key={z} value={z} />
        ))}
      </datalist>
      <span className="muted" style={{ fontSize: 13 }}>
        Empty follows this device ({timeZone}). Every reminder's date is read in this zone.
      </span>
    </Panel>
  );
}

/** When a reminder with only a date is due. */
function ReminderTime() {
  const { local } = useCave();
  const zone = useReminderZone();
  return (
    <Panel>
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
        For reminders with a date and no time.
      </span>
    </Panel>
  );
}

/** Theme, what the app opens on, and motion. */
function Look() {
  const { local } = useCave();
  const theme = useText("theme") || "graphite";
  const motion = useText("motion") || "on";
  const [, sectionId, tabId] = LANDING.split("/");
  const section = SECTIONS.find((s) => s.id === sectionId);
  const tab = section?.tabs.find((t) => t.id === tabId);
  return (
    <Panel>
      <label style={{ display: "grid", gap: 6 }}>
        <span className="k">Theme</span>
        <select
          className="input"
          value={theme}
          onChange={(e) => void local.write(SETTINGS, { theme: e.target.value })}
        >
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <div style={{ display: "grid", gap: 6 }}>
        <span className="k">Opens on</span>
        <span>
          {section?.label} → {tab?.label}
        </span>
      </div>
      <label style={{ display: "grid", gap: 6 }}>
        <span className="k">Motion</span>
        <select
          className="input"
          value={motion}
          onChange={(e) => void local.write(SETTINGS, { motion: e.target.value })}
        >
          {MOTION.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <span className="muted" style={{ fontSize: 13 }}>
        "Follow the system setting" stops animation when the OS asks for reduced motion.
      </span>
    </Panel>
  );
}

/** The phone dock's four sections, the same as the dock's own Edit. */
function PhoneDock() {
  const { local } = useCave();
  const settings = useDoc(local.db, "settings");
  const dock = dockOf(settings?.data).map((s) => s.id);
  return (
    <Panel>
      <span className="k">Phone dock</span>
      <EditDock
        key={dock.join()}
        current={dock}
        onSave={(ids) => void local.write(SETTINGS, { dock: ids })}
      />
    </Panel>
  );
}

/** The radar's interests; they move to Projects → Ideas with M11 part 8. */
function RadarInterests() {
  const { local } = useCave();
  const settings = useDoc(local.db, "settings");
  const text = formatInterests(interestsOf(settings?.data));
  return (
    <Panel>
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
    </Panel>
  );
}
