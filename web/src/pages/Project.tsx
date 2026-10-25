import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { fieldsOf } from "../../../shared/fields.ts";
import { FLOWS } from "../../../shared/flows/seed.ts";
import { newId } from "../../../shared/ids.ts";
import {
  isLive,
  isQuestion,
  lastStamp,
  openQuestions,
  type ProjectSummary,
  STATE_LABEL,
  STATE_TOKEN,
  summarize,
} from "../../../shared/project-status.ts";
import {
  LINKED,
  linkedTo,
  PARTS,
  type PartNode,
  partsTree,
  projectPrompt,
  templatesOf,
} from "../../../shared/projects.ts";
import { parseSteps, RUNS } from "../../../shared/runs.ts";
import type { Doc } from "../../../shared/types.ts";
import { useActivity } from "../app/activity.ts";
import { useCave } from "../app/context.ts";
import { useNow, useToday } from "../app/hooks.ts";
import { useWriteError } from "../app/project-actions.ts";
import { collectionPath, flowPath, projectPath } from "../app/router.ts";
import { ASK_WHERE, askClaude, browserAsk } from "../logic/ask-claude.ts";
import { titleOf } from "../logic/views.ts";
import { useAllItems, useCollections, useDoc } from "../store/queries.ts";
import { ActivityList } from "../ui/Activity.tsx";
import { Diagram } from "../ui/Diagram.tsx";
import { DocDrawer } from "../ui/DocDrawer.tsx";
import { OptionChip } from "../ui/fields.tsx";
import { Icon } from "../ui/icon.tsx";
import { ProjectMap } from "../ui/ProjectMap.tsx";
import { rowOpen } from "../ui/row-open.ts";
import { CollectionView } from "./CollectionPage.tsx";

const TABS = [
  ["overview", "Overview"],
  ["board", "Board"],
  ["diagram", "Diagram"],
  ["canvas", "Canvas"],
  ["activity", "Activity"],
] as const;

const DAY = 24 * 60 * 60 * 1000;
const text = (v: unknown) => (typeof v === "string" ? v : "");
const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Every project has the same skeleton (M11 part 6): `/projects/<id>/<tab>`. */
export function ProjectPage({ rest }: { rest: string[] }) {
  const [id = "", tabId] = rest;
  const { db } = useCave().local;
  const project = useDoc(db, id);
  const all = useAllItems(db);
  const collections = useCollections(db);
  const settings = useDoc(db, "settings");
  const today = useToday();
  const now = useNow().getTime();
  const tab = TABS.find(([t]) => t === tabId)?.[0] ?? "overview";

  const linked = useMemo(() => {
    const items = all ?? [];
    const of = (c: string) =>
      linkedTo(
        items.filter((d) => d.collection === c),
        id,
      );
    return { of, parts: of(PARTS), tasks: of("tasks"), runs: of(RUNS) };
  }, [all, id]);

  if (project === undefined || !collections || !all) return <p className="muted">Loading…</p>;
  if (project.collection !== "projects" || project.data._deleted === true)
    return <p className="muted">No project “{id}”.</p>;
  const summary = summarize(
    {
      project,
      parts: linked.parts,
      tasks: linked.tasks,
      runs: linked.runs,
      others: [...linked.of("notes"), ...linked.of("ideas")],
    },
    templatesOf(settings?.data)[text(project.data.template)]?.progress,
    linked.of,
    today,
    now,
  );

  return (
    <>
      <Head project={project} summary={summary} runs={linked.runs} now={now} />
      <nav aria-label="Project tabs" className="section-tabs">
        {TABS.map(([t, label]) => (
          <a key={t} href={projectPath(id, t)} aria-current={t === tab ? "page" : undefined}>
            {label}
          </a>
        ))}
      </nav>
      {tab === "overview" && (
        <Overview project={project} parts={linked.parts} tasks={linked.tasks} of={linked.of} />
      )}
      {tab === "board" && <CollectionView key="board" id="tasks" viewId="board" project={id} />}
      {tab === "diagram" && <Diagram project={project} />}
      {tab === "canvas" && <ProjectMap project={project} />}
      {tab === "activity" && <ProjectActivity project={project.id} />}
    </>
  );
}

/** The status ring (progress, in the state's colour), name, state, goal and the meta line. */
function Head({
  project,
  summary,
  runs,
  now,
}: {
  project: Doc;
  summary: ProjectSummary;
  runs: Doc[];
  now: number;
}) {
  const { db } = useCave().local;
  const collections = useCollections(db);
  const status = fieldsOf(collections?.find((c) => c.id === "projects")).find(
    (f) => f.id === "status",
  );
  const share =
    summary.progress && summary.progress.total > 0
      ? Math.round((summary.progress.done / summary.progress.total) * 100)
      : 0;
  const colour = `var(${STATE_TOKEN[summary.state]})`;
  const agents = [
    ...new Set(
      runs
        .filter((r) => isLive(r) && lastStamp(r) >= now - 30 * DAY)
        .map((r) => text(r.data.agent))
        .filter(Boolean),
    ),
  ];
  const lastReport = runs
    .filter(isLive)
    .map(lastStamp)
    .sort((a, b) => b - a)[0];
  const livesIn = text(project.data.lives_in);
  const review = text(project.data.review);
  const meta: ReactNode[] = [];
  if (livesIn)
    meta.push(
      <span key="lives">
        lives in <b>{livesIn}</b>
      </span>,
    );
  if (agents.length > 0)
    meta.push(
      <span key="agents">
        agent{agents.length === 1 ? "" : "s"} <b>{agents.join(", ")}</b>
      </span>,
    );
  if (summary.progress)
    meta.push(
      <span key="progress">
        {summary.progress.done} of {summary.progress.total} {summary.progress.of}
      </span>,
    );
  if (lastReport)
    meta.push(
      <span key="report">
        last report <b>{when(lastReport)}</b>
      </span>,
    );
  if (review)
    meta.push(
      <span key="review">
        next review <b>{review}</b>
      </span>,
    );

  return (
    <header className="project-head">
      <div
        className="status-ring"
        style={{ "--share": share, "--ring": colour } as React.CSSProperties}
        role="img"
        aria-label={`${share}% done, ${STATE_LABEL[summary.state]}`}
      >
        <span aria-hidden="true">{summary.progress ? `${share}%` : "—"}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.02em" }}>{titleOf(project)}</h2>
        <span className="chip" style={{ background: "var(--on)", color: colour }}>
          {STATE_LABEL[summary.state]}
        </span>
        {status && <OptionChip field={status} value={project.data.status} />}
        <PinToggle project={project} />
      </div>
      {text(project.data.goal) ? (
        <p style={{ margin: 0 }}>{text(project.data.goal)}</p>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          No goal yet.
        </p>
      )}
      <p className="project-meta" style={{ margin: 0 }}>
        {meta.length === 0 && <span>Nothing reported yet.</span>}
        {meta.map((m, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the parts never reorder
          <span key={i}>
            {i > 0 && " · "}
            {m}
          </span>
        ))}
      </p>
    </header>
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
        style={{ accentColor: "var(--accent)" }}
      />
      <span className="muted" style={{ fontSize: 13 }}>
        Pinned
      </span>
    </label>
  );
}

/** Plan, the latest from the agent, what the project is connected to, then the forms. */
function Overview({
  project,
  parts,
  tasks,
  of,
}: {
  project: Doc;
  parts: Doc[];
  tasks: Doc[];
  of: (collection: string) => Doc[];
}) {
  const [drawer, setDrawer] = useState<Doc>();
  const open = tasks.filter(
    (t) => isLive(t) && !isQuestion(t) && t.data.status !== "done" && t.data.status !== "dropped",
  );
  const partOf = (t: Doc) => parts.find((p) => p.id === t.data.part);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="split">
        <Plan project={project.id} parts={parts} onOpen={setDrawer} />
        <div style={{ display: "grid", gap: 16 }}>
          <Latest project={project} tasks={tasks} onOpen={setDrawer} />
          <Connected project={project} of={of} />
        </div>
      </div>
      <section className="panel" style={{ padding: 16, display: "grid", gap: 8 }}>
        <span className="k">Open tasks</span>
        {open.length === 0 && <span className="muted">No open tasks.</span>}
        <ul aria-label="Open tasks" style={{ margin: 0, padding: 0, display: "grid", gap: 4 }}>
          {open.slice(0, 8).map((t) => (
            <li
              key={t.id}
              style={{ listStyle: "none", display: "flex", gap: 8 }}
              {...rowOpen(() => setDrawer(t))}
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

/** The parts as a checklist in order; the first part not done is current; blocked ones say why. */
function Plan({
  project,
  parts,
  onOpen,
}: {
  project: string;
  parts: Doc[];
  onOpen(doc: Doc): void;
}) {
  const { db } = useCave().local;
  const collections = useCollections(db);
  const status = fieldsOf(collections?.find((c) => c.id === PARTS)).find((f) => f.id === "status");
  const [title, setTitle] = useState("");
  const [parent, setParent] = useState("");
  const write = useWriteError();
  const tree = partsTree(parts);
  const flat: PartNode[] = [];
  const walk = (nodes: PartNode[]) => {
    for (const n of nodes) {
      flat.push(n);
      walk(n.children);
    }
  };
  walk(tree);
  const current = flat.find((n) => n.doc.data.status !== "done" && n.doc.data.status !== "dropped")
    ?.doc.id;

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

  const row = (node: PartNode, depth: number): ReactNode => {
    const s = text(node.doc.data.status);
    const why = s === "blocked" ? text(node.doc.data._body).split("\n")[0]?.trim() : "";
    return (
      <li key={node.doc.id} style={{ listStyle: "none" }}>
        <div
          className={`plan-row${node.doc.id === current ? " current" : ""}`}
          data-status={s}
          style={{ paddingLeft: depth * 16 }}
          {...rowOpen(() => onOpen(node.doc))}
        >
          <span className="mark" aria-hidden="true">
            {s === "done" && <Icon name="check" size={11} />}
            {s === "blocked" && <Icon name="x" size={11} />}
          </span>
          <span className="plan-title" style={{ flex: 1 }}>
            {titleOf(node.doc)}
            {why && (
              <span className="muted" style={{ display: "block", fontSize: 12.5 }}>
                {why}
              </span>
            )}
          </span>
          {node.doc.id === current && <span className="muted">current</span>}
          {status && <OptionChip field={status} value={node.doc.data.status} />}
        </div>
        {node.children.length > 0 && (
          <ul style={{ margin: 0, padding: 0 }}>{node.children.map((c) => row(c, depth + 1))}</ul>
        )}
      </li>
    );
  };

  return (
    <section className="panel" aria-label="Parts" style={{ padding: 16, display: "grid", gap: 8 }}>
      <span className="k">Plan</span>
      {tree.length === 0 && <span className="muted">No parts yet.</span>}
      <ul style={{ margin: 0, padding: 0 }}>{tree.map((n) => row(n, 0))}</ul>
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

/** The newest run on the project: who, when, its last step, and its open question. */
function Latest({
  project,
  tasks,
  onOpen,
}: {
  project: Doc;
  tasks: Doc[];
  onOpen(doc: Doc): void;
}) {
  const { entries } = useActivity(project.id);
  const run = entries.find((e) => e.source === "agent");
  const runDoc = useDoc(useCave().local.db, run?.id);
  const questions = openQuestions(tasks).filter((t) => !run || t.data._run === run.id);
  const step = run?.steps.at(-1);
  const summary = text(runDoc?.data._body).split("\n")[0]?.trim();
  const steps = runDoc ? parseSteps(runDoc.data.steps) : undefined;
  const last = summary || step?.title || (steps?.ok ? steps.steps.at(-1)?.title : "");
  return (
    <section
      className="panel"
      aria-label="Latest from the agent"
      style={{ padding: 16, display: "grid", gap: 8 }}
    >
      <span className="k">Latest from the agent</span>
      {!run && <span className="muted">No agent has worked on this project yet.</span>}
      {run && (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
            <strong>{run.by}</strong>
            <span className="chip" style={{ background: "var(--on)" }}>
              {run.status}
            </span>
            <span className="num muted" style={{ marginLeft: "auto", fontSize: 12 }}>
              {when(run.finishedAt ?? run.startedAt)}
            </span>
          </div>
          <span>{run.title}</span>
          {last && <span className="muted">{last}</span>}
          {questions.map((q) => (
            <div
              key={q.id}
              style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
            >
              <span style={{ flex: 1 }}>
                <em>Question:</em> {titleOf(q).replace(/^Answer: /, "")}
              </span>
              <button type="button" className="btn primary" onClick={() => onOpen(q)}>
                Answer
              </button>
            </div>
          ))}
          <a className="link" href={projectPath(project.id, "activity")} style={{ fontSize: 13 }}>
            All runs
          </a>
        </>
      )}
    </section>
  );
}

/** Chips: where it lives, its notes, the flows that name it, and each collection with items. */
function Connected({ project, of }: { project: Doc; of: (collection: string) => Doc[] }) {
  const { local } = useCave();
  const collections = useCollections(local.db);
  const livesIn = text(project.data.lives_in);
  const notes = of("notes").filter(isLive);
  const flows = of(FLOWS).filter(isLive);
  const name = (c: string) => collections?.find((x) => x.id === c)?.data.name ?? c;
  const filtered = (c: string) => {
    const base = collectionPath(c);
    return `${base}${base.includes("?") ? "&" : "?"}project=${encodeURIComponent(project.id)}`;
  };
  const withItems = LINKED.filter((c) => c !== FLOWS && of(c).filter(isLive).length > 0);
  const url = /^https?:\/\//i.test(livesIn);
  return (
    <section
      className="panel"
      aria-label="Connected"
      style={{ padding: 16, display: "grid", gap: 10 }}
    >
      <span className="k">Connected</span>
      <div className="connected">
        {livesIn &&
          (url ? (
            <a className="chip" href={livesIn} target="_blank" rel="noreferrer">
              <Icon name="external-link" size={12} /> {livesIn}
            </a>
          ) : (
            <span className="chip num" style={{ background: "var(--on)" }}>
              {livesIn}
            </span>
          ))}
        {notes.length > 0 && (
          <span className="chip" style={{ background: "var(--on)" }}>
            {notes.length} note{notes.length === 1 ? "" : "s"}
          </span>
        )}
        {flows.map((f) => (
          <a key={f.id} className="chip" href={flowPath(f.id)}>
            flow: {titleOf(f)}
          </a>
        ))}
        {withItems.map((c) => (
          <a key={c} className="chip" href={filtered(c)}>
            {of(c).filter(isLive).length} {name(c).toLowerCase()}
          </a>
        ))}
        {!livesIn && notes.length === 0 && flows.length === 0 && withItems.length === 0 && (
          <span className="muted">Nothing linked yet.</span>
        )}
      </div>
      <label style={{ display: "grid", gap: 4 }}>
        <span className="k">Lives in</span>
        <input
          key={livesIn}
          className="input"
          defaultValue={livesIn}
          placeholder="A repo URL, a path, an app"
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next !== livesIn)
              void local.write(
                { id: project.id, kind: "item", collection: "projects" },
                { lives_in: next || null },
              );
          }}
        />
      </label>
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
  const ask = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    await askClaude(projectPrompt(project, text.trim()), browserAsk);
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
        {ASK_WHERE}; the question is also copied.
      </span>
    </form>
  );
}

/** The project's runs, live, with a filter by agent. */
function ProjectActivity({ project }: { project: string }) {
  const { entries } = useActivity(project);
  const [agent, setAgent] = useState("");
  const agents = [...new Set(entries.filter((e) => e.source === "agent").map((e) => e.by))];
  const shown = agent ? entries.filter((e) => e.by === agent) : entries;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {agents.length > 0 && (
        <select
          className="input"
          aria-label="Agent"
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
          style={{ width: "auto" }}
        >
          <option value="">Every agent</option>
          {agents.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      )}
      <ActivityList entries={shown} label="Project runs" />
    </div>
  );
}
