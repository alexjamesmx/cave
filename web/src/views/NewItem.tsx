import { type FormEvent, useState } from "react";
import { useSaver } from "../app/hooks.ts";

interface Props {
  collection: string;
  /** Extra values for the new item, e.g. the board column it was added to. */
  preset?: Record<string, unknown>;
  placeholder?: string;
  onCreated?(id: string): void;
}

export function NewItem({ collection, preset, placeholder = "New item", onCreated }: Props) {
  const saver = useSaver(collection);
  const [title, setTitle] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const id = await saver.create({ ...preset, _title: title.trim() });
    if (!id) return;
    setTitle("");
    onCreated?.(id);
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 8 }}>
      <input
        className="input"
        style={{ flex: 1, minWidth: 0 }}
        aria-label={placeholder}
        placeholder={placeholder}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <button type="submit" className="btn">
        Add
      </button>
      {saver.error && (
        <span role="alert" className="error">
          {saver.error}
        </span>
      )}
    </form>
  );
}
