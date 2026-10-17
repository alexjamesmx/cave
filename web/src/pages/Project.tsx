import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { transferCategories } from "../../../shared/categories.ts";
import { fieldsOf } from "../../../shared/fields.ts";
import { newId } from "../../../shared/ids.ts";
import {
  linkedTo,
  overviewOf,
  PARTS,
  type PartNode,
  partsTree,
  projectPrompt,
  templatesOf,
} from "../../../shared/projects.ts";
import type { Doc } from "../../../shared/types.ts";
import { currentProvider } from "../ai/providers.ts";
import { useCave } from "../app/context.ts";
import { useWriteError } from "../app/project-actions.ts";
import { projectPath, setSearch, useSearch } from "../app/router.ts";
import { formatMoney } from "../logic/format.ts";
import { titleOf } from "../logic/views.ts";
import { useAllItems, useCollections, useDoc } from "../store/queries.ts";
import { BarRow, Stat } from "../ui/charts.tsx";
import { DocDrawer } from "../ui/DocDrawer.tsx";
import { FieldValue, OptionChip } from "../ui/fields.tsx";
import { ProjectMap } from "../ui/ProjectMap.tsx";
import { rowOpen } from "../ui/row-open.ts";
import { CollectionView } from "./CollectionPage.tsx";

const TABS = [
  ["overview", "Overview"],
  ["map", "Map"],
  ["board", "Board"],
  ["activity", "Activity"],
  ["items", "Items"],
] as const;

/** One project: `/projects/<id>/<tab>`. */
export function ProjectPage({ rest }: { rest: string[] }) {
  const [id = "", tabId] = rest;
  const { db } = useCave().local;
  const project = useDoc(db, id);
  const collections = useCollections(db);
  const tab = TABS.find(([t]) => t === tabId)?.[0] ?? "overview";

  if (project === undefined || !collections) return <p className="muted">Loading…</p>;
  if (project.collection !== "projects" || project.data._deleted === true)
    return <p className="muted">No project “{id}”.</p>;
  const fields = fieldsOf(collections.find((c) => c.id === "projects"));
  const status = fields.find((f) => f.id === "status");

  return (
    <>
      <header style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.02em" }}>{titleOf(project)}</h2>
        {status && <OptionChip field={status} value={project.data.status} />}
        <PinToggle project={project} />
      </header>
      <nav aria-label="Project tabs" className="section-tabs">
        {TABS.map(([t, label]) => (
          <a key={t} href={projectPath(id, t)} aria-current={t === tab ? "page" : undefined}>
            {label}
          </a>
        ))}
      </nav>
      {tab === "overview" && <Overview project={project} />}
      {tab === "map" && <ProjectMap project={project} />}
      {tab === "board" && <CollectionView key="board" id="tasks" viewId="board" project={id} />}
      {tab === "activity" && <p className="muted">Project activity arrives in M8 part 4.</p>}
      {tab === "items" && <Items project={project} />}
    </>
  );
}

function PinToggle({ project }: { project: Doc }) {
  const { local } = useCave();
  return (
    <label style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
      <input
        type="checkbox"
        checked={project.data.pinned === true}
        onChange={(e) =>
          void local.write(
            { id: project.id, kind: "item", collection: "projects" },
            { pinned: e.target.checked },
          )
        }
        style={{ accentColor: "var(--lime)" }}
      />
      <span className="muted" style={{ fontSize: 13 }}>
        Pinned
      </span>
    </label>
  );
}

function Overview({ project }: { project: Doc }) {
  const { db } = useCave().local;
  const all = useAllItems(db);
  const collections = useCollections(db);
  const settings = useDoc(db, "settings");
  const template = templatesOf(settings?.data)[String(project.data.template ?? "generic")];
  const [drawer, setDrawer] = useState<Doc>();
  const show = (doc: Doc) => setDrawer(doc);
  const byCollection = useMemo(() => {
    const map = new Map<string, Doc[]>();
    for (const d of all ?? []) {
      const list = map.get(d.collection ?? "") ?? [];
      list.push(d);
      map.set(d.collection ?? "", list);
    }
    return map;
  }, [all]);
  if (!all || !collections) return null;
  const itemsOf = (c: string) => byCollection.get(c) ?? [];
  const category = fieldsOf(collections.find((c) => c.id === "money")).find(
    (f) => f.id === "category",
  );
  const o = overviewOf(project.id, template, itemsOf, transferCategories(category));
  const taskStatus = fieldsOf(collections.find((c) => c.id === "tasks")).find(
    (f) => f.id === "status",
  );
  const name = (c: string) => collections.find((x) => x.id === c)?.data.name ?? c;
  const parts = linkedTo(itemsOf(PARTS), project.id);
  const goal = typeof project.data.goal === "string" ? project.data.goal : "";
  const open = linkedTo(itemsOf("tasks"), project.id).filter(
    (t) => t.data.status !== "done" && t.data.status !== "dropped",
  );
  const partOf = (t: Doc) => parts.find((p) => p.id === t.data.part);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {goal && (
        <section className="panel" style={{ padding: 16 }}>
          <span className="k">Goal</span>
          <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{goal}</p>
        </section>
      )}
      <div className="stats">
        {template?.widgets.includes("progress") && (
          <Stat
            label="Progress"
            value={`${o.progress.done}/${o.progress.total}`}
            note={`${name(o.progress.of)} done`}
            tone="var(--lime)"
          />
        )}
        {template?.widgets.includes("budget") && (
          <Stat
            label="Spent"
            value={formatMoney(o.budget.spent)}
            note={`${o.budget.count} expenses`}
          />
        )}
        {template?.widgets.includes("counts") &&
          o.counts.map((c) => (
            <Stat key={c.collection} label={name(c.collection)} value={c.count} />
          ))}
      </div>
      <div className="split">
        <Parts project={project.id} tree={partsTree(parts)} parts={parts} onOpen={show} />
        <section className="panel" style={{ padding: 16, display: "grid", gap: 8 }}>
          <span className="k">Next due</span>
          {o.upcoming.length === 0 && <span className="muted">Nothing with a due date.</span>}
          {o.upcoming.slice(0, 6).map((u) => (
            <div key={u.id} style={{ display: "flex", gap: 8 }}>
              <span style={{ flex: 1 }}>{u.title}</span>
              <span className="muted">{u.kind}</span>
              <FieldValue field={{ id: "due", name: "Due", type: "date" }} value={u.due} />
            </div>
          ))}
        </section>
      </div>
      <div className="split">
        {template?.widgets.includes("board") && (
          <section className="panel" style={{ padding: 16, display: "grid", gap: 8 }}>
            <span className="k">Tasks</span>
            {o.tasks.length === 0 && <span className="muted">No tasks yet.</span>}
            {o.tasks.map((t) => (
              <BarRow
                key={t.status}
                label={taskStatus ? <OptionChip field={taskStatus} value={t.status} /> : t.status}
                value={t.count}
                share={t.count / Math.max(...o.tasks.map((x) => x.count))}
                color={
                  taskStatus?.options?.find((x) => x.value === t.status)?.color ?? "var(--muted)"
                }
              />
            ))}
            <ul aria-label="Open tasks" style={{ margin: 0, padding: 0, display: "grid", gap: 4 }}>
              {open.slice(0, 8).map((t) => (
                <li
                  key={t.id}
                  style={{ listStyle: "none", display: "flex", gap: 8 }}
                  {...rowOpen(() => show(t))}
                >
                  <span style={{ flex: 1 }}>{titleOf(t)}</span>
                  {partOf(t) && <span className="muted">{titleOf(partOf(t) as Doc)}</span>}
                </li>
              ))}
            </ul>
            <a className="link" href={projectPath(project.id, "board")}>
              Open the board
            </a>
          </section>
        )}
        {template?.widgets.includes("runs") && (
          <section className="panel" style={{ padding: 16, display: "grid", gap: 8 }}>
            <span className="k">Flows</span>
            {o.flows.length === 0 && (
              <span className="muted">No flows linked to this project.</span>
            )}
            {o.flows.map((f) => (
              <span key={f.id} {...rowOpen(() => show(f))}>
                {titleOf(f)}
              </span>
            ))}
          </section>
        )}
      </div>
      <AddTask project={project.id} parts={parts} />
      <AskProject project={project} />
      {drawer && (
        <DocDrawer
          id={drawer.id}
          collection={drawer.collection ?? ""}
          onClose={() => setDrawer(undefined)}
        />
      )}
    </div>
  );
}

function Parts({
  project,
  tree,
  parts,
  onOpen,
}: {
  project: string;
  tree: PartNode[];
  parts: Doc[];
  onOpen(doc: Doc): void;
}) {
  const { db } = useCave().local;
  const collections = useCollections(db);
  const status = fieldsOf(collections?.find((c) => c.id === PARTS)).find((f) => f.id === "status");
  const [title, setTitle] = useState("");
  const [parent, setParent] = useState("");
  const write = useWriteError();

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const order = Math.max(0, ...parts.map((p) => Number(p.data.order) || 0)) + 1;
    const ok = await write.run([
      {
        id: newId(),
        collection: PARTS,
        patch: {
          _title: title.trim(),
          project,
          status: "planned",
          order,
          ...(parent ? { parent } : {}),
        },
      },
    ]);
    if (ok) setTitle("");
  };

  const row = (node: PartNode, depth: number): ReactNode => (
    <li key={node.doc.id} style={{ listStyle: "none" }}>
      <div
        style={{ display: "flex", gap: 8, alignItems: "center", paddingLeft: depth * 16 }}
        {...rowOpen(() => onOpen(node.doc))}
      >
        <span style={{ flex: 1 }}>{titleOf(node.doc)}</span>
        {status && <OptionChip field={status} value={node.doc.data.status} />}
      </div>
      {node.children.length > 0 && (
        <ul style={{ margin: 0, padding: 0 }}>{node.children.map((c) => row(c, depth + 1))}</ul>
      )}
    </li>
  );

  return (
    <section className="panel" aria-label="Parts" style={{ padding: 16, display: "grid", gap: 8 }}>
      <span className="k">Parts</span>
      {tree.length === 0 && <span className="muted">No parts yet.</span>}
      <ul style={{ margin: 0, padding: 0, display: "grid", gap: 6 }}>
        {tree.map((n) => row(n, 0))}
      </ul>
      <form onSubmit={(e) => void add(e)} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          className="input"
          style={{ flex: "1 1 160px" }}
          aria-label="New part"
          placeholder="New part"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {parts.length > 0 && (
          <select
            className="input"
            style={{ width: "auto" }}
            aria-label="Inside part"
            value={parent}
            onChange={(e) => setParent(e.target.value)}
          >
            <option value="">Top level</option>
            {parts.map((p) => (
              <option key={p.id} value={p.id}>
                {titleOf(p)}
              </option>
            ))}
          </select>
        )}
        <button type="submit" className="btn">
          Add part
        </button>
      </form>
      {write.error && (
        <p role="alert" className="error">
          {write.error}
        </p>
      )}
    </section>
  );
}

function AddTask({ project, parts }: { project: string; parts: Doc[] }) {
  const [title, setTitle] = useState("");
  const [part, setPart] = useState("");
  const write = useWriteError();

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const ok = await write.run([
      {
        id: newId(),
        collection: "tasks",
        patch: { _title: title.trim(), status: "todo", project, ...(part ? { part } : {}) },
      },
    ]);
    if (ok) setTitle("");
  };

  return (
    <form
      className="panel"
      aria-label="Add task"
      onSubmit={(e) => void add(e)}
      style={{ padding: 16, display: "flex", gap: 8, flexWrap: "wrap" }}
    >
      <input
        className="input"
        style={{ flex: "1 1 200px" }}
        aria-label="New task"
        placeholder="New task"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      {parts.length > 0 && (
        <select
          className="input"
          style={{ width: "auto" }}
          aria-label="Task part"
          value={part}
          onChange={(e) => setPart(e.target.value)}
        >
          <option value="">No part</option>
          {parts.map((p) => (
            <option key={p.id} value={p.id}>
              {titleOf(p)}
            </option>
          ))}
        </select>
      )}
      <button type="submit" className="btn">
        Add task
      </button>
      {write.error && (
        <span role="alert" className="error">
          {write.error}
        </span>
      )}
    </form>
  );
}

function AskProject({ project }: { project: Doc }) {
  const [text, setText] = useState("");
  const provider = currentProvider();
  const ask = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    await provider.ask(projectPrompt(project, text.trim()), {
      open: (url) => window.open(url, "_blank", "noopener"),
      copy: (value) => navigator.clipboard.writeText(value),
    });
    setText("");
  };
  return (
    <form
      className="panel"
      onSubmit={(e) => void ask(e)}
      style={{ padding: 16, display: "grid", gap: 8 }}
    >
      <label className="k" htmlFor="ask-project">
        Ask about this project
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          id="ask-project"
          className="input"
          style={{ flex: 1 }}
          placeholder="What should I do next?"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn primary" disabled={!text.trim()}>
          Ask
        </button>
      </div>
      <span className="muted" style={{ fontSize: 13 }}>
        {provider.where}; the question is also copied.
      </span>
    </form>
  );
}

/** The template's collections, filtered to this project, one at a time (`?c=`). */
function Items({ project }: { project: Doc }) {
  const { db } = useCave().local;
  const settings = useDoc(db, "settings");
  const collections = useCollections(db);
  const search = useSearch();
  const template = templatesOf(settings?.data)[String(project.data.template ?? "generic")];
  const list = (template?.collections ?? ["tasks"]).filter((c) =>
    collections?.some((x) => x.id === c),
  );
  const params = new URLSearchParams(search);
  const current = list.find((c) => c === params.get("c")) ?? list[0];
  const views = collections?.find((c) => c.id === current)?.data.views ?? [];
  const view = views.find((v) => v.id === params.get("view")) ?? views[0];
  const go = (c: string, v?: string) =>
    setSearch(`?${new URLSearchParams(v ? { c, view: v } : { c }).toString()}`);
  if (!current) return <p className="muted">This template lists no collections.</p>;
  const chip = (active: boolean) => ({
    color: active ? "var(--on-lime)" : "var(--text)",
    background: active ? "var(--lime)" : "#11141a",
    border: 0,
    cursor: "pointer",
  });
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <nav aria-label="Collections" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {list.map((c) => (
          <button
            key={c}
            type="button"
            className="chip"
            aria-pressed={c === current}
            style={chip(c === current)}
            onClick={() => go(c)}
          >
            {collections?.find((x) => x.id === c)?.data.name ?? c}
          </button>
        ))}
      </nav>
      {views.length > 1 && (
        <nav aria-label="Views" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              className="chip"
              aria-pressed={v.id === view?.id}
              style={chip(v.id === view?.id)}
              onClick={() => go(current, v.id)}
            >
              {v.name}
            </button>
          ))}
        </nav>
      )}
      <CollectionView
        key={`${current}-${view?.id}`}
        id={current}
        viewId={view?.id}
        project={project.id}
      />
    </div>
  );
}
