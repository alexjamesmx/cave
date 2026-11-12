import { type CSSProperties, useEffect, useState } from "react";
import { openNew } from "../app/quick.ts";
import { usePathname } from "../app/router.ts";
import { DOCK, SECTIONS, type Section, sectionOf } from "../app/sections.ts";
import { Icon } from "./icon.tsx";
import { Sheet } from "./Sheet.tsx";

/**
 * The phone's navigation (CSS shows it under 768 px, M14): Money, Tasks, a raised New,
 * Calendar and Notes. Flows and Settings are one tap away in each page's ⚙️ (Everything).
 */
export function Dock() {
  const active = sectionOf(usePathname());
  const link = (s: Section) => (
    <a
      key={s.id}
      href={s.path}
      className="dock-item"
      aria-current={s.id === active ? "page" : undefined}
      style={{ "--c": s.color } as CSSProperties}
    >
      <span className="dock-emoji" aria-hidden="true" data-emoji={s.emoji} />
      <span>{s.label}</span>
    </a>
  );
  return (
    <nav aria-label="Dock" className="dock">
      {DOCK.slice(0, 2).map(link)}
      <button type="button" className="dock-new" aria-label="New" onClick={() => openNew()}>
        <Icon name="plus" size={26} strokeWidth={2.4} />
      </button>
      {DOCK.slice(2).map(link)}
    </nav>
  );
}

/** ⚙️ in a page's header on a phone: every section, Flows and Settings included. */
export function EverythingButton() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Navigating closes the sheet.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the path is the trigger
  useEffect(() => setOpen(false), [pathname]);
  return (
    <>
      <button
        type="button"
        className="icon-btn phone-only"
        aria-label="Everything"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">⚙️</span>
      </button>
      {open && (
        <Sheet title="Everything" onClose={() => setOpen(false)}>
          <div className="more-grid">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={s.path}
                className="more-item"
                style={{ "--c": s.color } as CSSProperties}
              >
                <span className="emoji-tile" aria-hidden="true" data-emoji={s.emoji} />
                <span>{s.label}</span>
              </a>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}
