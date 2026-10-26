import { type ReactNode, useState } from "react";
import { openNew } from "../app/quick.ts";
import { railWide, setRailWide } from "../app/rail.ts";
import type { Route } from "../app/router.ts";
import { SECTIONS, type Section } from "../app/sections.ts";
import { Dock } from "./Dock.tsx";
import { EnvBadge } from "./EnvBadge.tsx";
import { Icon } from "./icon.tsx";
import { NewSheet } from "./NewSheet.tsx";
import { ClockAheadBanner, SyncBadge, SyncProblemBanner } from "./SyncBadge.tsx";

/**
 * The rail (M11): the mark, New, one icon per section from the registry with Settings at the
 * bottom, then the sync state. Show names (M12) widens it to icons with labels, per device. Each link keeps its label for assistive tech and shows it
 * beside the icon on hover or focus; the dock reads the same registry on a phone.
 */
export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const active = route.name === "section" ? route.section : undefined;
  const [wide, setWide] = useState(railWide);
  const toggle = () => {
    setRailWide(!wide);
    setWide(!wide);
  };
  const link = (s: Section) => (
    <a
      key={s.id}
      href={s.path}
      className={s.id === active ? "on" : undefined}
      aria-current={s.id === active ? "page" : undefined}
      data-label={s.label}
    >
      <Icon name={s.icon} size={18} color={s.id === active ? s.color : undefined} />
      <span className="rail-label">{s.label}</span>
    </a>
  );
  return (
    <div className="app">
      <aside className="side">
        <a className="brand-mark" href="/" aria-label="Cave" data-label="Cave">
          <Icon name="zap" size={16} strokeWidth={2.2} />
        </a>
        <button
          type="button"
          className="rail-new"
          aria-label="New"
          data-label="New · ⌘K"
          onClick={() => openNew()}
        >
          <Icon name="plus" size={18} />
        </button>
        <nav aria-label="Main" className="rail-nav">
          {SECTIONS.filter((s) => s.id !== "settings").map(link)}
          <div className="rail-end">
            <button
              type="button"
              className="rail-toggle"
              aria-pressed={wide}
              aria-label={wide ? "Hide names" : "Show names"}
              data-label={wide ? "Hide names" : "Show names"}
              onClick={toggle}
            >
              <Icon name={wide ? "panel-left-close" : "panel-left-open"} size={16} />
            </button>
            {SECTIONS.filter((s) => s.id === "settings").map(link)}
          </div>
        </nav>
        <SyncBadge />
      </aside>
      <main className="stage">
        <div className="page">
          <ClockAheadBanner />
          <SyncProblemBanner />
          {children}
        </div>
      </main>
      <Dock />
      <NewSheet />
      <EnvBadge />
    </div>
  );
}
