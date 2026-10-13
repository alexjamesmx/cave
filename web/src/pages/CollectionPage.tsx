import { useCave } from "../app/context.ts";
import { collectionPath } from "../app/router.ts";
import { useCollections, useItems } from "../store/queries.ts";
import { Icon } from "../ui/icon.tsx";

export function CollectionPage({ id, viewId }: { id: string; viewId: string | undefined }) {
  const { db } = useCave().local;
  const collections = useCollections(db);
  const items = useItems(db, id);
  if (!collections) return null;
  const collection = collections.find((c) => c.id === id);
  if (!collection) return <p className="muted">No collection called “{id}”.</p>;
  const { name, icon, color, views } = collection.data;
  const view = views.find((v) => v.id === viewId) ?? views[0];

  return (
    <>
      <header style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span className="ico" style={{ background: `${color}1f`, color }}>
          <Icon name={icon} size={20} />
        </span>
        <h1 style={{ margin: 0, fontSize: 32, letterSpacing: "-0.03em" }}>{name}</h1>
        <span className="num muted">{items?.length ?? "…"}</span>
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
    </>
  );
}
