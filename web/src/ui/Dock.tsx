import { type ReactNode, useEffect, useState } from "react";
import { useCave } from "../app/context.ts";
import { usePathname } from "../app/router.ts";
import { DOCK_SIZE, dockOf, SECTIONS, type Section, sectionOf } from "../app/sections.ts";
import { useDoc } from "../store/queries.ts";
import { AskBox } from "./AskBox.tsx";
import { Icon } from "./icon.tsx";

const SETTINGS = { id: "settings", kind: "setting" as const, collection: null };
type Sheet = "more" | "ask" | "edit" | undefined;

/** The phone's navigation (CSS shows it under 768 px): four sections and a raised Ask. */
export function Dock() {
  const { local } = useCave();
  const settings = useDoc(local.db, "settings");
  const dock = dockOf(settings?.data);
  const active = sectionOf(usePathname());
  const [sheet, setSheet] = useState<Sheet>();
  const pathname = usePathname();

  // Navigating closes whatever sheet was open.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the path is the trigger
  useEffect(() => setSheet(undefined), [pathname]);

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
        <button
          type="button"
          className="dock-ask"
          aria-label="Ask"
          aria-expanded={sheet === "ask"}
          onClick={() => setSheet(sheet === "ask" ? undefined : "ask")}
        >
          <Icon name="message-circle" size={24} strokeWidth={2.2} />
        </button>
        {dock.slice(2).map(link)}
        <button
          type="button"
          className="dock-item"
          aria-expanded={sheet === "more" || sheet === "edit"}
          onClick={() => setSheet(sheet ? undefined : "more")}
        >
          <Icon name="grid-2x2" size={20} />
          <span>More</span>
        </button>
      </nav>
      {sheet === "ask" && (
        <SheetPanel title="Ask" onClose={() => setSheet(undefined)}>
          <AskBox autoFocus onAsked={() => setSheet(undefined)} />
        </SheetPanel>
      )}
      {sheet === "more" && (
        <SheetPanel title="Everything" onClose={() => setSheet(undefined)}>
          <div className="more-grid">
            {SECTIONS.map((s) => (
              <a key={s.id} href={s.path} className="more-item">
                <Icon name={s.icon} size={22} color={s.color} />
                <span>{s.label}</span>
              </a>
            ))}
          </div>
          <button type="button" className="btn" onClick={() => setSheet("edit")}>
            Edit dock
          </button>
        </SheetPanel>
      )}
      {sheet === "edit" && (
        <SheetPanel title="Edit dock" onClose={() => setSheet(undefined)}>
          <EditDock
            current={dock.map((s) => s.id)}
            onSave={(ids) => {
              void local.write(SETTINGS, { dock: ids });
              setSheet(undefined);
            }}
          />
        </SheetPanel>
      )}
    </>
  );
}

function SheetPanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose(): void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop">
      <button
        type="button"
        className="sheet-scrim"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
      />
      <section className="panel sheet" role="dialog" aria-label={title}>
        <header style={{ display: "flex", alignItems: "center" }}>
          <span className="k" style={{ flex: 1 }}>
            {title}
          </span>
          <button type="button" className="btn" aria-label="Close" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </header>
        {children}
      </section>
    </div>
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
