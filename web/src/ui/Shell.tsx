import type { ReactNode } from "react";
import type { Route } from "../app/router.ts";
import { SECTIONS } from "../app/sections.ts";
import { Dock } from "./Dock.tsx";
import { EnvBadge } from "./EnvBadge.tsx";
import { Icon } from "./icon.tsx";
import { ClockAheadBanner, SyncBadge, SyncProblemBanner } from "./SyncBadge.tsx";

/** The sidebar lists the eight sections from the registry, each once; the dock reads the same. */
export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const active = route.name === "section" ? route.section : undefined;
  return (
    <div className="app">
      <nav aria-label="Main" className="side">
        <div className="brand">
          <div className="brand-mark">
            <Icon name="zap" size={18} strokeWidth={2.2} />
          </div>
          <div className="brand-text" style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Cave</span>
            <span className="num muted" style={{ fontSize: 11 }}>
              v0.1
            </span>
          </div>
        </div>
        <div className="nav-group">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={s.path}
              className={s.id === active ? "on" : undefined}
              aria-current={s.id === active ? "page" : undefined}
            >
              <Icon name={s.icon} size={17} color={s.color} />
              {s.label}
              {s.id === "calendar" && (
                <span className="kbd" aria-hidden="true">
                  C
                </span>
              )}
            </a>
          ))}
        </div>
        <SyncBadge />
      </nav>
      <main className="stage">
        <div className="page">
          <ClockAheadBanner />
          <SyncProblemBanner />
          {children}
        </div>
      </main>
      <Dock />
      <EnvBadge />
    </div>
  );
}
