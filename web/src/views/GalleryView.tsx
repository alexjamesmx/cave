import { useMemo } from "react";
import { applyFilter, defaultSort, readFilter, titleOf } from "../logic/views.ts";
import { FieldValue } from "../ui/fields.tsx";
import { NewItem } from "./NewItem.tsx";
import type { ViewProps } from "./types.ts";

const excerpt = (body: unknown) =>
  typeof body === "string" ? body.replace(/[#*_>`-]/g, "").slice(0, 220) : "";

export function GalleryView({ collection, view, items, open, preset }: ViewProps) {
  const { fields } = collection.data;
  const cards = useMemo(
    () => defaultSort(applyFilter(items, readFilter(view.config)), fields),
    [items, view.config, fields],
  );
  const chips = fields.filter((f) => f.type === "select" || f.type === "date").slice(0, 3);

  return (
    <>
      <NewItem collection={collection.id} {...(preset ? { preset } : {})} onCreated={open} />
      <div className="gallery">
        {cards.map((doc) => (
          <button key={doc.id} type="button" className="panel card" onClick={() => open(doc.id)}>
            <span style={{ fontWeight: 600, fontSize: 16 }}>{titleOf(doc)}</span>
            <span style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
              {chips.map((f) =>
                doc.data[f.id] === undefined ? null : (
                  <FieldValue key={f.id} field={f} value={doc.data[f.id]} />
                ),
              )}
            </span>
            <span className="muted diary-text" style={{ fontSize: 14 }}>
              {excerpt(doc.data._body)}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
