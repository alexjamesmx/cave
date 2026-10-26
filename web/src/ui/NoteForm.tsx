import { type FormEvent, useState } from "react";
import { newId } from "../../../shared/ids.ts";
import { NOTES, normFolder } from "../../../shared/notes.ts";
import { isLive } from "../../../shared/project-status.ts";
import { useCave } from "../app/context.ts";
import { titleOf } from "../logic/views.ts";
import { useItems } from "../store/queries.ts";

/** Creates a note and returns its id; `folder` and `project` place it. */
export async function createNote(
  local: ReturnType<typeof useCave>["local"],
  title: string,
  folder: string,
  project?: string,
): Promise<string> {
  const id = newId();
  await local.write(
    { id, kind: "item", collection: NOTES },
    {
      _title: title,
      folder: normFolder(folder),
      source: "owner",
      ...(project ? { project } : {}),
    },
  );
  return id;
}

/**
 * The New sheet's Note form: a title, Markdown, and a project when it has one (a page of that
 * project); without one it is a note in Notes.
 */
export function NoteForm({ onDone }: { onDone(message: string): void }) {
  const { local } = useCave();
  const projects = (useItems(local.db, "projects") ?? []).filter(
    (p) => isLive(p) && p.data.status !== "dropped",
  );
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [project, setProject] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const id = await createNote(local, title.trim(), "", project || undefined);
    if (text.trim())
      await local.write({ id, kind: "item", collection: NOTES }, { _body: text.trim() });
    onDone(`Saved · Note · ${title.trim()}`);
  };
  return (
    <form className="panel quick-form" aria-label="Note" onSubmit={(e) => void submit(e)}>
      <label className="quick-field">
        <span className="k">Title</span>
        <input
          className="input"
          required
          // biome-ignore lint/a11y/noAutofocus: the N shortcut opens this form to type
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="quick-field">
        <span className="k">Text</span>
        <textarea
          className="input"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <label className="quick-field">
        <span className="k">Project</span>
        <select className="input" value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="">Notes (no project)</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {titleOf(p)}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn primary" disabled={!title.trim()}>
        {project ? "Save as a page" : "Save to Notes"}
      </button>
    </form>
  );
}
