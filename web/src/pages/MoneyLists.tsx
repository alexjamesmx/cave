import { activeFields } from "../../../shared/fields.ts";
import type { Field, OptionKind, SelectOption } from "../../../shared/schema.ts";
import { useCave } from "../app/context.ts";
import { editFields } from "../app/lists.ts";
import { useCollections } from "../store/queries.ts";
import { OptionsEditor } from "../ui/OptionsEditor.tsx";

/** Money's two lists; payments read them through `optionsFrom`, so they are edited once, here. */
const LISTS = ["category", "account"];

/** Categories in three lists by what the money does; a category's kind moves it between them. */
const SECTIONS: { kind: OptionKind; title: string; name: string }[] = [
  { kind: "expense", title: "Expense categories", name: "Expense category" },
  { kind: "income", title: "Income categories", name: "Income category" },
  { kind: "transfer", title: "Transfers", name: "Transfer category" },
];

/** Money → Categories & accounts: the lists every expense, income and payment picks from. */
export function MoneyLists() {
  const { local } = useCave();
  const money = useCollections(local.db)?.find((c) => c.id === "money");
  if (!money) return null;
  const fields = activeFields(money.data.fields).filter(
    (f): f is Field & { type: "select" } => f.type === "select" && LISTS.includes(f.id),
  );
  const save = (field: string, update: (options: SelectOption[]) => SelectOption[]) =>
    editFields(local, "money", (all) =>
      all.map((f) => (f.id === field ? { ...f, options: update(f.options ?? []) } : f)),
    );
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <p className="muted" style={{ margin: 0 }}>
        Renaming changes only what you see: items keep their value. Archived options stay on old
        items and can be restored. Payments use the same lists.
      </p>
      {fields.flatMap((field) =>
        (field.id === "category" ? SECTIONS : [undefined]).map((s) => (
          <section
            key={s ? s.kind : field.id}
            className="panel"
            aria-label={`${s ? s.title : field.name} list`}
            style={{ padding: 16, display: "grid", gap: 10 }}
          >
            <h2 style={{ margin: 0, fontSize: 18 }}>{s ? s.title : field.name}</h2>
            <OptionsEditor
              name={s ? s.name : field.name}
              options={field.options ?? []}
              kinds={field.id === "category"}
              {...(s ? { section: s.kind } : {})}
              onChange={(update) => void save(field.id, update)}
            />
          </section>
        )),
      )}
    </div>
  );
}
