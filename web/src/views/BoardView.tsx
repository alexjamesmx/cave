import { useState } from "react";
import { useSaver } from "../app/hooks.ts";
import { groupBy, titleOf } from "../logic/views.ts";
import { FieldValue, OptionChip } from "../ui/fields.tsx";
import { NewItem } from "./NewItem.tsx";
import type { ViewProps } from "./types.ts";

export function BoardView({ collection, view, items, open }: ViewProps) {
  const { fields } = collection.data;
  const field = fields.find((f) => f.id === view.config.groupBy && f.type === "select");
  const saver = useSaver(collection.id);
  const [dragging, setDragging] = useState<string>();
  if (!field) return <p className="muted">This board needs a select field to group by.</p>;
  const shownFields = fields.filter((f) => f.id !== field.id).slice(0, 2);

  return (
    <>
      {saver.error && (
        <p role="alert" className="error">
          {saver.error}
        </p>
      )}
      <div className="board">
        {groupBy(items, field).map((group) => (
          <section
            key={group.value ?? "__none"}
            className="panel column"
            aria-label={group.value ?? "No value"}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragging) void saver.save(dragging, { [field.id]: group.value });
              setDragging(undefined);
            }}
          >
            <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {group.value ? (
                <OptionChip field={field} value={group.value} />
              ) : (
                <span className="k">No {field.name.toLowerCase()}</span>
              )}
              <span className="num muted">{group.docs.length}</span>
            </header>
            {group.docs.map((doc) => (
              <button
                key={doc.id}
                type="button"
                className="card"
                draggable
                onDragStart={() => setDragging(doc.id)}
                onClick={() => open(doc.id)}
              >
                <span style={{ fontWeight: 600 }}>{titleOf(doc)}</span>
                <span style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
                  {shownFields.map((f) =>
                    doc.data[f.id] === undefined ? null : (
                      <FieldValue key={f.id} field={f} value={doc.data[f.id]} />
                    ),
                  )}
                </span>
              </button>
            ))}
            {group.value && (
              <NewItem
                collection={collection.id}
                preset={{ [field.id]: group.value }}
                placeholder="Add"
              />
            )}
          </section>
        ))}
      </div>
    </>
  );
}
