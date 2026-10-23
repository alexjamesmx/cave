import { type ComponentType, useCallback, useState } from "react";
import { linkedTo } from "../../../shared/projects.ts";
import type { ViewType } from "../../../shared/schema.ts";
import { useCave } from "../app/context.ts";
import { useSearch } from "../app/router.ts";
import { withActiveFields } from "../logic/field-edits.ts";
import { useCollections, useItems } from "../store/queries.ts";
import { FieldEditor } from "../ui/FieldEditor.tsx";
import { ItemDrawer } from "../ui/ItemDrawer.tsx";
import { Icon } from "../ui/icon.tsx";
import { ProjectFilter, projectFilterOf } from "../ui/ProjectFilter.tsx";
import { BoardView } from "../views/BoardView.tsx";
import { CalendarView } from "../views/CalendarView.tsx";
import { GalleryView } from "../views/GalleryView.tsx";
import { HabitsDashboard } from "../views/HabitsDashboard.tsx";
import { MoneyDashboard } from "../views/MoneyDashboard.tsx";
import { PaymentsView } from "../views/PaymentsView.tsx";
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
  payments: PaymentsView,
};

/**
 * One view of a collection, with the item drawer: what a section's tab shows. `project`
 * scopes it to one project (a project's Board and Items); without it, a collection with a
 * project field gets a project filter kept in the URL.
 */
export function CollectionView({
  id,
  viewId,
  project,
}: {
  id: string;
  viewId: string | undefined;
  project?: string;
}) {
  const { db } = useCave().local;
  const collections = useCollections(db);
  const items = useItems(db, id);
  const search = useSearch();
  const [open, setOpen] = useState<string>();
  const show = useCallback((item: string) => setOpen(item), []);
  const close = useCallback(() => setOpen(undefined), []);

  if (!collections) return null;
  const stored = collections.find((c) => c.id === id);
  if (!stored) return <p className="muted">No collection called “{id}”.</p>;
  const collection = withActiveFields(stored);
  const view = collection.data.views.find((v) => v.id === viewId) ?? collection.data.views[0];
  const View = view ? VIEWS[view.type] : undefined;
  const linkable = collection.data.fields.some((f) => f.id === "project" && f.type === "ref");
  const filter = project ?? (linkable ? projectFilterOf(search) : undefined);
  const shown = filter && items ? linkedTo(items, filter) : items;
  return (
    <>
      {linkable && project === undefined && <ProjectFilter value={filter} />}
      {view && View && shown && (
        <View
          key={view.id}
          collection={collection}
          view={view}
          items={shown}
          open={show}
          {...(filter ? { preset: { project: filter } } : {})}
        />
      )}
      {open && <ItemDrawer key={open} collection={collection} id={open} onClose={close} />}
    </>
  );
}

/**
 * Raw access to one collection (Settings → Data): every view, the field editor and the items.
 * Sections show the same views as tabs; this is where the structure itself is edited.
 */
export function CollectionPage({ id, viewId }: { id: string; viewId: string | undefined }) {
  const { db } = useCave().local;
  const collections = useCollections(db);
  const items = useItems(db, id);
  const [fields, setFields] = useState(false);

  if (!collections) return null;
  const stored = collections.find((c) => c.id === id);
  if (!stored) return <p className="muted">No collection called “{id}”.</p>;
  const { name, icon, color, views } = stored.data;
  const view = views.find((v) => v.id === viewId) ?? views[0];
  const base = `/settings/data/${encodeURIComponent(id)}`;

  return (
    <>
      <header style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span className="ico" style={{ background: `${color}1f`, color }}>
          <Icon name={icon} size={20} />
        </span>
        <h2 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.02em" }}>{name}</h2>
        <span className="num muted">{items?.length ?? "…"}</span>
        <button
          type="button"
          className="btn"
          style={{ marginLeft: "auto" }}
          onClick={() => setFields(true)}
        >
          <Icon name="sliders-horizontal" size={15} />
          Fields
        </button>
      </header>
      <nav aria-label="Views" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {views.map((v) => (
          <a
            key={v.id}
            href={`${base}/${encodeURIComponent(v.id)}`}
            className="chip"
            aria-current={v.id === view?.id ? "page" : undefined}
            style={{
              textDecoration: "none",
              color: v.id === view?.id ? "var(--on-lime)" : "var(--text)",
              background: v.id === view?.id ? "var(--lime)" : "var(--on)",
            }}
          >
            {v.name}
          </a>
        ))}
      </nav>
      {view && <CollectionView key={view.id} id={id} viewId={view.id} />}
      {fields && <FieldEditor collection={stored} onClose={() => setFields(false)} />}
    </>
  );
}
