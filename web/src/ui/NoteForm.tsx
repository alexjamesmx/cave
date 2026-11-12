import { type FormEvent, useState } from "react";
import { newId } from "../../../shared/ids.ts";
import { NOTES, normFolder } from "../../../shared/notes.ts";
import { useCave } from "../app/context.ts";

/** Creates a note in `folder`, with its Markdown if any, in one write, and returns its id. */
export async function createNote(
  local: ReturnType<typeof useCave>["local"],
  title: string,
  folder: string,
  body = "",
): Promise<string> {
  const id = newId();
  await local.write(
    { id, kind: "item", collection: NOTES },
    {
      _title: title,
      ...(body ? { _body: body } : {}),
      folder: normFolder(folder),
      source: "owner",
    },
  );
  return id;
}

/** The New sheet's Note form: a title and Markdown, saved to Notes. */
export function NoteForm({ onDone }: { onDone(message: string): void }) {
  const { local } = useCave();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await createNote(local, title.trim(), "", text.trim());
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
      <button type="submit" className="btn primary" disabled={!title.trim()}>
        Save to Notes
      </button>
    </form>
  );
}
