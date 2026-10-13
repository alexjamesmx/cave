import { type ComponentType, useCallback, useState } from "react";
import type { ViewType } from "../../../shared/schema.ts";
import { useCave } from "../app/context.ts";
import { collectionPath } from "../app/router.ts";
import { withActiveFields } from "../logic/field-edits.ts";
import { useCollections, useItems } from "../store/queries.ts";
import { FieldEditor } from "../ui/FieldEditor.tsx";
import { ItemDrawer } from "../ui/ItemDrawer.tsx";
import { Icon } from "../ui/icon.tsx";
import { BoardView } from "../views/BoardView.tsx";
import { CalendarView } from "../views/CalendarView.tsx";
import { GalleryView } from "../views/GalleryView.tsx";
import { HabitsDashboard } from "../views/HabitsDashboard.tsx";
import { MoneyDashboard } from "../views/MoneyDashboard.tsx";
import { ProgressDashboard } from "../views/ProgressDashboard.tsx";
import { TableView } from "../views/TableView.tsx";
import type { ViewProps } from "../views/types.ts";
import { WealthDashboard } from "../views/WealthDashboard.tsx";
import { WriteView } from "../views/WriteView.tsx";

const VIEWS: Record<ViewType, ComponentType<ViewProps>> = {
  table: TableView,
  board: BoardView,
  gallery: GalleryView,
  calendar: CalendarView,
  write: WriteView,
  money: MoneyDashboard,
  wealth: WealthDashboard,
  habits: HabitsDashboard,
  progress: ProgressDashboard,
};

type Panel = { kind: "item"; id: string } | { kind: "fields" } | undefined;

export function CollectionPage({ id, viewId }: { id: string; viewId: string | undefined }) {
  const { db } = useCave().local;
  const collections = useCollections(db);
  const items = useItems(db, id);
  const [panel, setPanel] = useState<Panel>();
  const open = useCallback((item: string) => setPanel({ kind: "item", id: item }), []);
  const close = useCallback(() => setPanel(undefined), []);

  if (!collections) return null;
  const stored = collections.find((c) => c.id === id);
  if (!stored) return <p className="muted">No collection called “{id}”.</p>;
  // Views and the drawer see active fields only; the field editor needs archived ones too.
  const collection = withActiveFields(stored);
  const { name, icon, color, views } = collection.data;
  const view = views.find((v) => v.id === viewId) ?? views[0];
  const View = view ? VIEWS[view.type] : undefined;

  return (
    <>
      <header style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span className="ico" style={{ background: `${color}1f`, color }}>
          <Icon name={icon} size={20} />
        </span>
        <h1 style={{ margin: 0, fontSize: 32, letterSpacing: "-0.03em" }}>{name}</h1>
        <span className="num muted">{items?.length ?? "…"}</span>
        <button
          type="button"
          className="btn"
          style={{ marginLeft: "auto" }}
          onClick={() => setPanel({ kind: "fields" })}
        >
          <Icon name="sliders-horizontal" size={15} />
          Fields
        </button>
      </header>
      <nav aria-label="Views" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {views.map((v) => (
          <a
            key={v.id}
            href={collectionPath(id, v.id)}
            className="chip"
            aria-current={v.id === view?.id ? "page" : undefined}
            style={{
              textDecoration: "none",
              color: v.id === view?.id ? "var(--on-lime)" : "var(--text)",
              background: v.id === view?.id ? "var(--lime)" : "#11141a",
            }}
          >
            {v.name}
          </a>
        ))}
      </nav>
      {view && View && items && (
        <View key={view.id} collection={collection} view={view} items={items} open={open} />
      )}
      {panel?.kind === "item" && (
        <ItemDrawer key={panel.id} collection={collection} id={panel.id} onClose={close} />
      )}
      {panel?.kind === "fields" && <FieldEditor collection={stored} onClose={close} />}
    </>
  );
}
