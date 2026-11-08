import { type FormEvent, useState } from "react";
import { fieldsOf } from "../../../shared/fields.ts";
import { newId } from "../../../shared/ids.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { useWriteError } from "../app/write-error.ts";
import { withActiveFields } from "../logic/field-edits.ts";
import { titleOf } from "../logic/views.ts";
import { useCollections, useItems } from "../store/queries.ts";
import { OptionChip } from "../ui/fields.tsx";
import { ItemDrawer } from "../ui/ItemDrawer.tsx";
import { rowOpen } from "../ui/row-open.ts";

/** Ideas → Ideas: your own ideas, newest first; capture one in a line, open one to edit it. */
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
  return (
    <li
      className="panel"
      style={{ listStyle: "none", padding: 12, display: "flex", gap: 8, alignItems: "center" }}
      {...rowOpen(onOpen)}
    >
      <button
        type="button"
        className="link"
        onClick={onOpen}
        style={{ flex: 1, textAlign: "left" }}
      >
        {titleOf(idea)}
      </button>
      {stage && <OptionChip field={stage} value={idea.data.stage} />}
    </li>
  );
}
