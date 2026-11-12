import { type CSSProperties, useMemo, useState } from "react";
import { FieldValueError } from "../../../shared/fields.ts";
import { PAYMENTS } from "../../../shared/payments.ts";
import type { OptionKind, SelectOption } from "../../../shared/schema.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { editFields } from "../app/lists.ts";
import { showToast } from "../app/toast.ts";
import { deleteCategoryPlan, holding, restoreOption } from "../logic/category-delete.ts";
import { useCollections, useItems } from "../store/queries.ts";
import { OptionsEditor } from "../ui/OptionsEditor.tsx";
import { OptionTile } from "../ui/OptionTile.tsx";
import { Sheet } from "../ui/Sheet.tsx";

interface List {
  id: string;
  label: string;
  /** Money's field; payments read both lists through `optionsFrom`, so they are edited here. */
  field: "category" | "account";
  kind?: OptionKind;
  /** One option's name, for labels: "New expense category". */
  name: string;
}

const LISTS: List[] = [
  {
    id: "expense",
    label: "Expenses",
    field: "category",
    kind: "expense",
    name: "Expense category",
  },
  { id: "income", label: "Income", field: "category", kind: "income", name: "Income category" },
  {
    id: "transfer",
    label: "Transfers",
    field: "category",
    kind: "transfer",
    name: "Transfer category",
  },
  { id: "account", label: "Accounts", field: "account", name: "Account" },
];

const tint = (color: string) => ({ "--c": color }) as CSSProperties;
const nameOf = (o: SelectOption) => o.label || o.value;

/** Whether an option belongs to a list: expense takes the kindless categories too. */
const inList = (list: List, o: SelectOption) =>
  list.field === "account" ||
  o.kind === list.kind ||
  (list.kind === "expense" && o.kind === undefined);

/**
 * Money → Categories (M14): the expense, income and transfer categories and the accounts, one
 * list at a time. A deleted option leaves the list for good; the entries that held it move to
 * another one or to nothing (To review), and Undo puts everything back.
 */
export function MoneyLists() {
  const { local } = useCave();
  const money = useCollections(local.db)?.find((c) => c.id === "money");
  const entries = useItems(local.db, "money");
  const payments = useItems(local.db, PAYMENTS);
  const [tab, setTab] = useState(LISTS[0] as List);
  const [deleting, setDeleting] = useState<{ list: List; option: SelectOption }>();
  const items = useMemo(() => [...(entries ?? []), ...(payments ?? [])], [entries, payments]);
  const counts = useMemo(() => {
    const byField = { category: new Map<string, number>(), account: new Map<string, number>() };
    for (const d of items)
      for (const f of ["category", "account"] as const) {
        const v = d.data[f];
        if (typeof v === "string") byField[f].set(v, (byField[f].get(v) ?? 0) + 1);
      }
    return byField;
  }, [items]);
  if (!money) return null;

  const optionsOf = (field: List["field"]) =>
    money.data.fields.find((f) => f.id === field)?.options ?? [];
  const save = (field: List["field"], update: (options: SelectOption[]) => SelectOption[]) =>
    editFields(local, "money", (all) =>
      all.map((f) => (f.id === field ? { ...f, options: update(f.options ?? []) } : f)),
    );
  const write = (doc: Doc, patch: Record<string, unknown>, undo = false) =>
    local.write(
      { id: doc.id, kind: "item", collection: doc.collection as string },
      patch,
      undo ? { selectMembership: false } : {},
    );

  const remove = async (list: List, option: SelectOption, moveTo: string | undefined) => {
    setDeleting(undefined);
    const { field } = list;
    const before = optionsOf(field);
    const plan = deleteCategoryPlan(before, items, option.value, moveTo, field);
    const byId = new Map(items.map((d) => [d.id, d]));
    for (const { id, patch } of plan.patches) {
      const doc = byId.get(id);
      if (!doc) continue;
      try {
        await write(doc, patch);
      } catch (err) {
        // A payment's list takes expense categories only; one it can't take leaves it empty.
        if (!(err instanceof FieldValueError)) throw err;
        await write(doc, { [field]: null });
      }
    }
    await save(field, (current) => current.filter((o) => o.value !== option.value));
    const moved = plan.patches.length;
    showToast({
      message: `Deleted ${nameOf(option)}${moved ? ` · ${moved} ${moved === 1 ? "entry" : "entries"} moved` : ""}`,
      undo: async () => {
        await save(field, (current) => restoreOption(current, before, option.value));
        for (const { id } of plan.patches) {
          const doc = byId.get(id);
          if (doc) await write(doc, { [field]: option.value }, true);
        }
      },
    });
  };
  const startDelete = (list: List, option: SelectOption) => {
    if (holding(items, option.value, list.field).length === 0) void remove(list, option, undefined);
    else setDeleting({ list, option });
  };

  return (
    <div className="mc-page">
      <fieldset className="mc-tabs">
        <legend className="sr">List</legend>
        {LISTS.map((l) => (
          <button
            key={l.id}
            type="button"
            className="pill"
            aria-pressed={tab.id === l.id}
            onClick={() => setTab(l)}
          >
            {l.label}
            <span className="mc-n num">
              {optionsOf(l.field).filter((o) => !o.archived && inList(l, o)).length}
            </span>
          </button>
        ))}
      </fieldset>
      <section className="panel mc-list" aria-label={`${tab.label} list`}>
        <OptionsEditor
          key={tab.id}
          name={tab.name}
          options={optionsOf(tab.field)}
          kinds={tab.field === "category"}
          {...(tab.kind ? { section: tab.kind } : {})}
          counts={counts[tab.field]}
          onChange={(update) => void save(tab.field, update)}
          onDelete={(option) => startDelete(tab, option)}
        />
      </section>
      {deleting && (
        <DeleteDialog
          option={deleting.option}
          count={holding(items, deleting.option.value, deleting.list.field).length}
          targets={optionsOf(deleting.list.field).filter(
            (o) => !o.archived && o.value !== deleting.option.value && inList(deleting.list, o),
          )}
          onCancel={() => setDeleting(undefined)}
          onDelete={(moveTo) => void remove(deleting.list, deleting.option, moveTo)}
        />
      )}
    </div>
  );
}

/** Where a deleted option's entries go: another option, or nothing, to wait in To review. */
function DeleteDialog({
  option,
  count,
  targets,
  onCancel,
  onDelete,
}: {
  option: SelectOption;
  count: number;
  targets: SelectOption[];
  onCancel(): void;
  onDelete(moveTo: string | undefined): void;
}) {
  const [moveTo, setMoveTo] = useState("");
  const title = `Delete “${nameOf(option)}”?`;
  return (
    <Sheet
      title={title}
      onClose={onCancel}
      heading={
        <span className="mc-delete-head" style={tint(option.color)}>
          <OptionTile option={option} />
          <b>{title}</b>
        </span>
      }
    >
      <label className="mc-move">
        <span>
          {count} {count === 1 ? "entry uses" : "entries use"} it. Move them to
        </span>
        <select className="input" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
          {targets.map((o) => (
            <option key={o.value} value={o.value}>
              {o.emoji ? `${o.emoji} ` : ""}
              {nameOf(o)}
            </option>
          ))}
          <option value="">Nothing — they wait in To review</option>
        </select>
      </label>
      <div className="mc-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn m-danger"
          onClick={() => onDelete(moveTo || undefined)}
        >
          Delete
        </button>
      </div>
    </Sheet>
  );
}
