import { type CSSProperties, type ReactNode, useState } from "react";
import { openNew } from "../app/quick.ts";
import { railWide, setRailWide } from "../app/rail.ts";
import type { Route } from "../app/router.ts";
import { SECTIONS, type Section } from "../app/sections.ts";
import { BrandMark } from "./BrandMark.tsx";
import { Dock } from "./Dock.tsx";
import { EnvBadge } from "./EnvBadge.tsx";
import { Icon } from "./icon.tsx";
import { NewSheet } from "./NewSheet.tsx";
import { ClockAheadBanner, SyncBadge, SyncProblemBanner } from "./SyncBadge.tsx";
import { Toasts } from "./UndoToast.tsx";

/**
 * A section's emoji on a tile of its own colour; the sidebar, the dock and headers share it.
 * The emoji is drawn by CSS from `data-emoji`, so a link's text stays its name alone.
 */
export function SectionTile({ section, size = 30 }: { section: Section; size?: number }) {
  return (
    <span
      className="emoji-tile"
      aria-hidden="true"
      data-emoji={section.emoji}
      style={{ "--c": section.color, "--size": `${size}px` } as CSSProperties}
    />
  );
}

/**
 * The sidebar (M14): the mark, New, one emoji tile per section from the registry with Settings
 * at the bottom, then the sync state. Wide with names by default; collapsed to tiles per
 * device, each link then keeps its name for assistive tech and shows it on hover or focus.
 * On a phone the dock and each page's header take its place.
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
      className={s.id === active ? "rail-link on" : "rail-link"}
      aria-current={s.id === active ? "page" : undefined}
      data-label={s.label}
      style={{ "--c": s.color } as CSSProperties}
    >
      <SectionTile section={s} />
      <span className="rail-label">{s.label}</span>
    </a>
  );
  return (
    <div className="app">
      <aside className="side">
        <a className="brand" href="/" aria-label="Cave" data-label="Cave">
          <BrandMark />
          <span className="rail-label brand-name">Cave</span>
        </a>
        <button
          type="button"
          className="rail-new"
          aria-label="New"
          data-label="New · ⌘K"
          onClick={() => openNew()}
        >
          <Icon name="plus" size={18} strokeWidth={2.4} />
          <span className="rail-label">New</span>
          <kbd className="rail-label rail-kbd">⌘K</kbd>
        </button>
        <nav aria-label="Main" className="rail-nav">
          {SECTIONS.filter((s) => s.id !== "settings").map(link)}
          <div className="rail-end">
            {SECTIONS.filter((s) => s.id === "settings").map(link)}
            <button
              type="button"
              className="rail-toggle"
              aria-pressed={wide}
              aria-label={wide ? "Hide names" : "Show names"}
              data-label={wide ? "Hide names" : "Show names"}
              onClick={toggle}
            >
              <Icon name={wide ? "panel-left-close" : "panel-left-open"} size={16} />
              <span className="rail-label">{wide ? "Hide names" : "Show names"}</span>
            </button>
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
      <Toasts />
      <EnvBadge />
    </div>
  );
}
