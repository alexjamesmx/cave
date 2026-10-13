import type { ReactNode } from "react";
import { useCave } from "../app/context.ts";
import { collectionPath, type Route } from "../app/router.ts";
import { useCollections } from "../store/queries.ts";
import { Icon } from "./icon.tsx";
import { ClockAheadBanner, SyncBadge } from "./SyncBadge.tsx";

export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const collections = useCollections(useCave().local.db) ?? [];
  const on = (active: boolean) => (active ? "on" : undefined);

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
          <a href="/" className={on(route.name === "home")}>
            <Icon name="house" size={17} color="var(--lime)" />
            Cave
          </a>
          <a href="/agents" className={on(route.name === "agents")}>
            <Icon name="bot" size={17} />
            Agents
          </a>
          <a href="/settings" className={on(route.name === "settings")}>
            <Icon name="settings" size={17} />
            Settings
          </a>
        </div>
        <div className="nav-group">
          <span className="k" style={{ padding: "0 10px 8px" }}>
            Collections
          </span>
          {collections
            .filter((c) => !c.data.hidden)
            .map((c) => (
              <a
                key={c.id}
                href={collectionPath(c.id)}
                className={on(route.name === "collection" && route.collection === c.id)}
              >
                <Icon name={c.data.icon} size={17} color={c.data.color} />
                {c.data.name}
              </a>
            ))}
        </div>
        <SyncBadge />
      </nav>
      <main className="stage">
        <div className="page">
          <ClockAheadBanner />
          {children}
        </div>
      </main>
    </div>
  );
}
