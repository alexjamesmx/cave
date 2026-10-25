import { type FormEvent, useMemo, useState } from "react";
import { optionText } from "../../../shared/categories.ts";
import { newId } from "../../../shared/ids.ts";
import { isLive } from "../../../shared/project-status.ts";
import type { Field } from "../../../shared/schema.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { useToday } from "../app/hooks.ts";
import { useWriteError } from "../app/project-actions.ts";
import { withActiveFields } from "../logic/field-edits.ts";
import { titleOf } from "../logic/views.ts";
import { useCollections, useItems } from "../store/queries.ts";
import { Stat } from "./charts.tsx";
import { FieldValue, OptionChip } from "./fields.tsx";
import { ItemDrawer } from "./ItemDrawer.tsx";
import { OptionPicker } from "./OptionPicker.tsx";
import { rowOpen } from "./row-open.ts";

const GROUPS = ["list", "topic", "pattern", "difficulty", "status"] as const;
type GroupBy = (typeof GROUPS)[number];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * A project's tracker tab (M12 part 6): the template's tracker collection (LeetCode's
 * problems) scoped to the project, with the numbers that matter at the top (solved by
 * difficulty, this week, what is due for review), chips by status, Group by, a quick form,
 * and the drawer for everything else.
 */
export function Tracker({
  project,
  collection: id,
  label,
}: {
  project: Doc;
  collection: string;
  label: string;
}) {
  const { db } = useCave().local;
  const today = useToday();
  const collections = useCollections(db);
  const items = useItems(db, id);
  const write = useWriteError();
  const [group, setGroup] = useState<GroupBy>("list");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<string>();
  const [form, setForm] = useState({ number: "", title: "", difficulty: "", list: "", url: "" });
  const stored = collections?.find((c) => c.id === id);
  const collection = stored ? withActiveFields(stored) : undefined;
  const field = (f: string) => collection?.data.fields.find((x) => x.id === f);
  const mine = useMemo(
    () => (items ?? []).filter((d) => d.data.project === project.id && isLive(d)),
    [items, project.id],
  );
  if (!collection || !items) return null;

  const solved = mine.filter((d) => d.data.status === "solved");
  const byDifficulty = ["easy", "medium", "hard"].map(
    (k) => [k, solved.filter((d) => d.data.difficulty === k).length] as const,
  );
  const weekAgo = new Date(Date.parse(`${today}T00:00:00Z`) - WEEK_MS).toISOString().slice(0, 10);
  const thisWeek = solved.filter((d) => str(d.data.solved_at).slice(0, 10) >= weekAgo).length;
  const due = mine
    .filter((d) => str(d.data.review_on) && str(d.data.review_on) <= today)
    .sort((a, b) => str(a.data.review_on).localeCompare(str(b.data.review_on)))
    .slice(0, 3);

  const shown = mine.filter((d) => !status || d.data.status === status);
  const groupField = field(group);
  const labelOf = (f: Field | undefined, v: unknown) => {
    const o = f?.options?.find((x) => x.value === v);
    return o ? optionText(o) : str(v) || "None";
  };
  const grouped = new Map<string, Doc[]>();
  for (const d of shown) {
    const key = str(d.data[group]);
    grouped.set(key, [...(grouped.get(key) ?? []), d]);
  }
  const order = (groupField?.options ?? []).map((o) => o.value);
  const keys = [...grouped.keys()].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
  const columns = ["number", "difficulty", "status", "pattern", "review_on"]
    .map(field)
    .filter((f): f is Field => f !== undefined);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    const patch: Record<string, unknown> = {
      _title: form.title.trim(),
      project: project.id,
      status: "queued",
      ...(form.number ? { number: Number(form.number) } : {}),
      ...(form.difficulty ? { difficulty: form.difficulty } : {}),
      ...(form.list ? { list: form.list } : {}),
      ...(form.url.trim() ? { url: form.url.trim() } : {}),
    };
    if (await write.run([{ id: newId(), collection: id, patch }]))
      setForm({ number: "", title: "", difficulty: "", list: "", url: "" });
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="tracker-head">
        <Stat
          label="Solved"
          value={`${solved.length} / ${mine.length}`}
          note={byDifficulty.map(([k, n]) => `${n} ${k}`).join(" · ")}
          tone="var(--ok)"
        />
        <Stat label="This week" value={String(thisWeek)} note="solved in the last 7 days" />
        <div className="panel stat">
          <span className="k">Due for review</span>
          {due.length === 0 && <span className="muted">Nothing due</span>}
          {due.map((d) => (
            <button key={d.id} type="button" className="link" onClick={() => setOpen(d.id)}>
              {titleOf(d)}
            </button>
          ))}
        </div>
      </div>
      <form
        className="panel quick-form"
        aria-label={`New ${label.toLowerCase().replace(/s$/, "")}`}
        onSubmit={(e) => void add(e)}
      >
        <div className="quick-row">
          <label className="quick-field" style={{ flex: "0 1 90px" }}>
            <span className="k">Number</span>
            <input
              className="input num"
              type="number"
              min="1"
              value={form.number}
              onChange={(e) => setForm({ ...form, number: e.target.value })}
            />
          </label>
          <label className="quick-field">
            <span className="k">Title</span>
            <input
              className="input"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label className="quick-field" style={{ flex: "0 1 140px" }}>
            <span className="k">Difficulty</span>
            <select
              className="input"
              value={form.difficulty}
              onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
            >
              <option value="">—</option>
              {field("difficulty")?.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {optionText(o)}
                </option>
              ))}
            </select>
          </label>
          <div className="quick-field" style={{ flex: "0 1 180px" }}>
            <span className="k">List</span>
            <OptionPicker
              label="List"
              options={field("list")?.options ?? []}
              value={form.list}
              onChange={(list) => setForm({ ...form, list })}
              emptyLabel="No list"
            />
          </div>
          <label className="quick-field">
            <span className="k">URL</span>
            <input
              className="input"
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
          </label>
          <button type="submit" className="btn primary" style={{ alignSelf: "end" }}>
            Add
          </button>
        </div>
        {write.error && (
          <p role="alert" className="error" style={{ margin: 0 }}>
            {write.error}
          </p>
        )}
      </form>
      <div className="ledger-controls">
        <fieldset className="chips">
          <legend className="sr">Status</legend>
          <button
            type="button"
            className="btn"
            aria-pressed={status === ""}
            onClick={() => setStatus("")}
          >
            All
          </button>
          {field("status")?.options?.map((o) => (
            <button
              key={o.value}
              type="button"
              className="btn"
              aria-pressed={status === o.value}
              onClick={() => setStatus(o.value)}
            >
              {optionText(o)}
            </button>
          ))}
        </fieldset>
        <label style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
          <span className="k">Group by</span>
          <select
            className="input"
            aria-label="Group by"
            value={group}
            onChange={(e) => setGroup(e.target.value as GroupBy)}
            style={{ width: "auto" }}
          >
            {GROUPS.map((g) => (
              <option key={g} value={g}>
                {field(g)?.name ?? g}
              </option>
            ))}
          </select>
        </label>
      </div>
      <section className="panel" style={{ padding: 4, overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              {columns.map((f) => (
                <th key={f.id}>{f.name}</th>
              ))}
            </tr>
          </thead>
          {keys.map((key) => (
            <tbody key={key || "\u0000"} aria-label={labelOf(groupField, key)}>
              <tr className="group-row">
                <td colSpan={columns.length + 1}>
                  {labelOf(groupField, key)}{" "}
                  <span className="num muted">{grouped.get(key)?.length}</span>
                </td>
              </tr>
              {grouped.get(key)?.map((d) => (
                <tr key={d.id} {...rowOpen(() => setOpen(d.id))}>
                  <td>
                    <button type="button" className="link" onClick={() => setOpen(d.id)}>
                      {titleOf(d)}
                    </button>
                  </td>
                  {columns.map((f) => (
                    <td key={f.id}>
                      {f.type === "select" ? (
                        <OptionChip field={f} value={d.data[f.id]} />
                      ) : (
                        <FieldValue field={f} value={d.data[f.id]} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
        {shown.length === 0 && (
          <p className="muted" style={{ padding: 12, margin: 0 }}>
            Nothing here yet.
          </p>
        )}
      </section>
      {open && (
        <ItemDrawer
          key={open}
          collection={collection}
          id={open}
          onClose={() => setOpen(undefined)}
        />
      )}
    </div>
  );
}
