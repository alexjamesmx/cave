import { type FormEvent, useState } from "react";
import { fieldsOf } from "../../../shared/fields.ts";
import { newId } from "../../../shared/ids.ts";
import { STATE_TOKEN, summarize, summaryLine } from "../../../shared/project-status.ts";
import {
  linkedTo,
  newProjectWrites,
  PARTS,
  promoteIdeaWrites,
  templatesOf,
} from "../../../shared/projects.ts";
import { RUNS } from "../../../shared/runs.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { useNow, useToday } from "../app/hooks.ts";
import { useWriteError } from "../app/project-actions.ts";
import { navigate, projectPath, setSearch, useSearch } from "../app/router.ts";
import { withActiveFields } from "../logic/field-edits.ts";
import { titleOf } from "../logic/views.ts";
import { useAllItems, useCollections, useDoc, useItems } from "../store/queries.ts";
import { FieldValue, OptionChip } from "../ui/fields.tsx";
import { ItemDrawer } from "../ui/ItemDrawer.tsx";
import { Icon } from "../ui/icon.tsx";
import { rowOpen } from "../ui/row-open.ts";

function TemplatePicker({ value, onChange }: { value: string; onChange(v: string): void }) {
  const settings = useDoc(useCave().local.db, "settings");
  const templates = templatesOf(settings?.data);
  return (
    <select
      className="input"
      style={{ width: "auto" }}
      aria-label="Template"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {Object.entries(templates).map(([id, t]) => (
        <option key={id} value={id}>
          {t.label}
        </option>
      ))}
    </select>
  );
}

/** Projects → All: a card per project with its parts' progress and what is due next. */
export function ProjectsAll() {
  const { db } = useCave().local;
  const projects = useItems(db, "projects");
  const parts = useItems(db, PARTS);
  const all = useAllItems(db);
  const collections = useCollections(db);
  const settings = useDoc(db, "settings");
  const search = useSearch();
  const today = useToday();
  const now = useNow().getTime();
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState("generic");
  const write = useWriteError();

  if (!projects || !parts || !collections || !all) return null;
  const templates = templatesOf(settings?.data);
  const itemsOf = (c: string) => all.filter((d) => d.collection === c);
  const nameOf = (c: string) => collections.find((x) => x.id === c)?.data.name ?? c;
  const fields = fieldsOf(collections.find((c) => c.id === "projects"));
  const status = fields.find((f) => f.id === "status");
  const params = new URLSearchParams(search);
  const statusFilter = params.get("status") ?? "";
  const areaFilter = params.get("area") ?? "";
  const areas = [...new Set(projects.map((p) => String(p.data.area ?? "")).filter(Boolean))];
  const shown = projects
    .filter((p) => !statusFilter || p.data.status === statusFilter)
    .filter((p) => !areaFilter || p.data.area === areaFilter)
    .sort(
      (a, b) =>
        Number(b.data.pinned === true) - Number(a.data.pinned === true) ||
        (titleOf(a) < titleOf(b) ? -1 : titleOf(a) > titleOf(b) ? 1 : 0),
    );
  const filter = (key: string, value: string) => {
    const next = new URLSearchParams(search);
    if (value) next.set(key, value);
    else next.delete(key);
    const s = next.toString();
    setSearch(s ? `?${s}` : "");
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const writes = newProjectWrites(
      { title: title.trim(), template },
      templatesOf(settings?.data),
      () => newId(),
    );
    if (await write.run(writes)) navigate(projectPath((writes[0] as { id: string }).id));
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <form
        onSubmit={(e) => void create(e)}
        aria-label="New project"
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
      >
        <input
          className="input"
          style={{ flex: "1 1 220px" }}
          aria-label="New project"
          placeholder="New project"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <TemplatePicker value={template} onChange={setTemplate} />
        <button type="submit" className="btn primary">
          <Icon name="plus" size={15} /> New project
        </button>
        {write.error && (
          <span role="alert" className="error">
            {write.error}
          </span>
        )}
      </form>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select
          className="input"
          style={{ width: "auto" }}
          aria-label="Status"
          value={statusFilter}
          onChange={(e) => filter("status", e.target.value)}
        >
          <option value="">Any status</option>
          {status?.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.value}
            </option>
          ))}
        </select>
        {areas.length > 0 && (
          <select
            className="input"
            style={{ width: "auto" }}
            aria-label="Area"
            value={areaFilter}
            onChange={(e) => filter("area", e.target.value)}
          >
            <option value="">Any area</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
      </div>
      {shown.length === 0 && <p className="muted">No projects match.</p>}
      <div className="project-cards">
        {shown.map((p) => {
          const own = linkedTo(parts, p.id);
          const linked = (c: string) => linkedTo(itemsOf(c), p.id);
          // The status model (M11 part 4): a template with its own progress rule (LeetCode:
          // problems solved) counts that; the line reads "72% · on track · agent working".
          const summary = summarize(
            {
              project: p,
              parts: own,
              tasks: linked("tasks"),
              runs: linked(RUNS),
              others: [...linked("notes"), ...linked("ideas")],
            },
            templates[String(p.data.template ?? "")]?.progress,
            linked,
            today,
            now,
          );
          const progress = summary.progress;
          const color = `var(${STATE_TOKEN[summary.state]})`;
          const next = own
            .filter((x) => typeof x.data.due === "string" && x.data.status !== "done")
            .sort((a, b) => String(a.data.due).localeCompare(String(b.data.due)))[0];
          return (
            <a key={p.id} href={projectPath(p.id)} className="panel project-card">
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="dot" style={{ background: color }} aria-hidden="true" />
                <strong style={{ flex: 1 }}>{titleOf(p)}</strong>
                {p.data.pinned === true && <Icon name="pin" size={14} />}
                {status && <OptionChip field={status} value={p.data.status} />}
              </span>
              <span className="muted" style={{ fontSize: 13 }}>
                {summaryLine(summary)}
                {progress && progress.total > 0
                  ? ` · ${progress.done} of ${progress.total} ${progress.of === "parts" || progress.of === "tasks" ? progress.of : nameOf(progress.of)}`
                  : ""}
              </span>
              {progress && progress.total > 0 && (
                <span className="bar-track" aria-hidden="true">
                  <span
                    className="bar-fill"
                    style={{
                      width: `${Math.max((progress.done / progress.total) * 100, 1)}%`,
                      background: color,
                    }}
                  />
                </span>
              )}
              {next && (
                <span style={{ fontSize: 13 }}>
                  Next: {titleOf(next)}{" "}
                  <FieldValue
                    field={{ id: "due", name: "Due", type: "date" }}
                    value={next.data.due}
                  />
                </span>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Projects → Ideas: your own ideas, newest first: capture one, promote it to a project with a
 * template, or start one with Claude. Agents' finds left this page in M12 part 5; the `radar`
 * collection stays under Settings → Data.
 */
export function IdeasPage() {
  const { db } = useCave().local;
  const ideas = useItems(db, "ideas");
  const collections = useCollections(db);
  const [title, setTitle] = useState("");
  const [open, setOpen] = useState<string>();
  const write = useWriteError();

  if (!ideas || !collections) return null;
  const collection = collections.find((c) => c.id === "ideas");
  const stage = fieldsOf(collection).find((f) => f.id === "stage");
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (
      await write.run([
        { id: newId(), collection: "ideas", patch: { _title: title.trim(), stage: "spark" } },
      ])
    )
      setTitle("");
  };
  const sorted = [...ideas].sort((a, b) =>
    String(b.data._created ?? "").localeCompare(String(a.data._created ?? "")),
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <form onSubmit={(e) => void add(e)} style={{ display: "flex", gap: 8 }}>
        <input
          className="input"
          style={{ flex: 1, minWidth: 0 }}
          aria-label="New idea"
          placeholder="New idea"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit" className="btn">
          Add
        </button>
      </form>
      {write.error && (
        <p role="alert" className="error">
          {write.error}
        </p>
      )}
      {sorted.length === 0 && <p className="muted">No ideas yet.</p>}
      <ul aria-label="Ideas" style={{ margin: 0, padding: 0, display: "grid", gap: 8 }}>
        {sorted.map((idea) => (
          <IdeaRow key={idea.id} idea={idea} stage={stage} onOpen={() => setOpen(idea.id)} />
        ))}
      </ul>
      {open && collection && (
        <ItemDrawer
          key={open}
          collection={withActiveFields(collection)}
          id={open}
          onClose={() => setOpen(undefined)}
        />
      )}
    </div>
  );
}

function IdeaRow({
  idea,
  stage,
  onOpen,
}: {
  idea: Doc;
  stage: Parameters<typeof OptionChip>[0]["field"] | undefined;
  onOpen(): void;
}) {
  const settings = useDoc(useCave().local.db, "settings");
  const [promoting, setPromoting] = useState(false);
  const [template, setTemplate] = useState("generic");
  const write = useWriteError();
  const project = typeof idea.data.project === "string" ? idea.data.project : undefined;

  const promote = async () => {
    const writes = promoteIdeaWrites(idea, template, templatesOf(settings?.data), () => newId());
    if (await write.run(writes)) navigate(projectPath((writes[0] as { id: string }).id));
  };

  return (
    <li
      className="panel"
      style={{ listStyle: "none", padding: 12, display: "grid", gap: 8 }}
      {...rowOpen(onOpen)}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          className="link"
          onClick={onOpen}
          style={{ flex: 1, textAlign: "left" }}
        >
          {titleOf(idea)}
        </button>
        {stage && <OptionChip field={stage} value={idea.data.stage} />}
        {project ? (
          <a className="chip" href={projectPath(project)}>
            Project
          </a>
        ) : (
          <button type="button" className="btn" onClick={() => setPromoting((v) => !v)}>
            Promote to project
          </button>
        )}
      </div>
      {promoting && !project && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <TemplatePicker value={template} onChange={setTemplate} />
          <button type="button" className="btn primary" onClick={() => void promote()}>
            Create project
          </button>
        </div>
      )}
      {write.error && (
        <span role="alert" className="error">
          {write.error}
        </span>
      )}
    </li>
  );
}
