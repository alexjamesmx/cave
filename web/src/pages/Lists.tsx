import { activeFields, unresolved } from "../../../shared/fields.ts";
import type { SelectOption } from "../../../shared/schema.ts";
import { useCave } from "../app/context.ts";
import { SECTIONS } from "../app/sections.ts";
import { type CollectionDoc, useCollections } from "../store/queries.ts";
import { OptionsEditor } from "../ui/OptionsEditor.tsx";

/**
 * Settings → Lists: every select the owner uses, by section. A shared list (payments'
 * categories and accounts) is edited once, at its source.
 */
export function SettingsLists() {
  const { local } = useCave();
  const collections = useCollections(local.db);
  if (!collections) return null;
  const byId = new Map(collections.map((c) => [c.id, c]));

  const save = (collection: CollectionDoc, field: string, options: SelectOption[]) =>
    local.write(
      { id: collection.id, kind: "collection", collection: null },
      {
        fields: unresolved(
          collection.data.fields.map((f) => (f.id === field ? { ...f, options } : f)),
        ),
      },
    );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <p className="muted" style={{ margin: 0 }}>
        Every choice the Cave offers. Renaming changes only what you see: items keep their value.
        Archived options stay on old items and can be restored.
      </p>
      {SECTIONS.filter((s) => s.owns.length > 0).map((section) => {
        const lists = section.owns
          .map((id) => byId.get(id))
          .filter((c): c is CollectionDoc => c !== undefined)
          .flatMap((c) =>
            activeFields(c.data.fields)
              .filter((f) => f.type === "select")
              .map((f) => ({ collection: c, field: f })),
          );
        if (lists.length === 0) return null;
        return (
          <section
            key={section.id}
            className="panel"
            aria-label={`${section.label} lists`}
            style={{ padding: 16, display: "grid", gap: 14 }}
          >
            <h2 style={{ margin: 0, fontSize: 18 }}>{section.label}</h2>
            {lists.map(({ collection, field }) => {
              const from = field.config?.optionsFrom;
              const source = from ? byId.get(from.collection) : undefined;
              const sourceField = source?.data.fields.find((f) => f.id === from?.field);
              return (
                <div key={`${collection.id}-${field.id}`} style={{ display: "grid", gap: 6 }}>
                  <span className="k">
                    {collection.data.name} · {field.name}
                  </span>
                  {from ? (
                    <span className="muted" style={{ fontSize: 13 }}>
                      Uses {source?.data.name ?? from.collection} →{" "}
                      {sourceField?.name ?? from.field}
                      {from.kinds ? ` (${from.kinds.join(", ")} only)` : ""}, so there is one list
                      to keep.
                    </span>
                  ) : (
                    <OptionsEditor
                      name={field.name}
                      options={field.options ?? []}
                      kinds={collection.id === "money" && field.id === "category"}
                      onChange={(options) => void save(collection, field.id, options)}
                    />
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
