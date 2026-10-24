import { useEffect, useState } from "react";
import { openAsk } from "../app/ask.ts";
import { useCave } from "../app/context.ts";
import { usePathname } from "../app/router.ts";
import { DOCK_SIZE, dockOf, SECTIONS, type Section, sectionOf } from "../app/sections.ts";
import { useDoc } from "../store/queries.ts";
import { Icon } from "./icon.tsx";
import { Sheet } from "./Sheet.tsx";

const SETTINGS = { id: "settings", kind: "setting" as const, collection: null };
type Panel = "more" | "edit" | undefined;

/** The phone's navigation (CSS shows it under 768 px): four sections and a raised Ask. */
export function Dock() {
  const { local } = useCave();
  const settings = useDoc(local.db, "settings");
  const dock = dockOf(settings?.data);
  const pathname = usePathname();
  const active = sectionOf(pathname);
  const [panel, setPanel] = useState<Panel>();

  // Navigating closes whatever sheet was open.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the path is the trigger
  useEffect(() => setPanel(undefined), [pathname]);

  const link = (s: Section) => (
    <a
      key={s.id}
      href={s.path}
      className="dock-item"
      aria-current={s.id === active ? "page" : undefined}
    >
      <Icon name={s.icon} size={20} />
      <span>{s.label}</span>
    </a>
  );

  return (
    <>
      <nav aria-label="Dock" className="dock">
        {dock.slice(0, 2).map(link)}
        <button type="button" className="dock-ask" aria-label="Ask" onClick={() => openAsk()}>
          <Icon name="message-circle" size={24} strokeWidth={2.2} />
        </button>
        {dock.slice(2).map(link)}
        <button
          type="button"
          className="dock-item"
          aria-expanded={panel !== undefined}
          onClick={() => setPanel(panel ? undefined : "more")}
        >
          <Icon name="grid-2x2" size={20} />
          <span>More</span>
        </button>
      </nav>
      {panel === "more" && (
        <Sheet title="Everything" onClose={() => setPanel(undefined)}>
          <div className="more-grid">
            {SECTIONS.map((s) => (
              <a key={s.id} href={s.path} className="more-item">
                <Icon name={s.icon} size={22} color={s.color} />
                <span>{s.label}</span>
              </a>
            ))}
          </div>
          <button type="button" className="btn" onClick={() => setPanel("edit")}>
            Edit dock
          </button>
        </Sheet>
      )}
      {panel === "edit" && (
        <Sheet title="Edit dock" onClose={() => setPanel(undefined)}>
          <EditDock
            current={dock.map((s) => s.id)}
            onSave={(ids) => {
              void local.write(SETTINGS, { dock: ids });
              setPanel(undefined);
            }}
          />
        </Sheet>
      )}
    </>
  );
}

/** Pick exactly four; the order picked is the dock's order, left to right. */
function EditDock({ current, onSave }: { current: string[]; onSave(ids: string[]): void }) {
  const [picked, setPicked] = useState(current);
  const toggle = (id: string) =>
    setPicked((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : p.length < DOCK_SIZE ? [...p, id] : p,
    );
  return (
    <>
      <span className="muted" style={{ fontSize: 13 }}>
        Pick {DOCK_SIZE}, in order. Every phone gets the same dock.
      </span>
      <div className="more-grid">
        {SECTIONS.map((s) => {
          const at = picked.indexOf(s.id);
          return (
            <button
              key={s.id}
              type="button"
              className="more-item"
              aria-pressed={at !== -1}
              onClick={() => toggle(s.id)}
            >
              <Icon name={s.icon} size={22} color={s.color} />
              <span>
                {at !== -1 ? `${at + 1}. ` : ""}
                {s.label}
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="btn primary"
        disabled={picked.length !== DOCK_SIZE}
        onClick={() => onSave(picked)}
      >
        Save dock
      </button>
    </>
  );
}
