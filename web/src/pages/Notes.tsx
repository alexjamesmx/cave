import { type CSSProperties, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { IDEAS_TOPIC, INBOX, NOTES, normFolder } from "../../../shared/notes.ts";
import { type Doc, isLive } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { useTimeZone, useToday } from "../app/hooks.ts";
import { isTyping, navigate, useSearch } from "../app/router.ts";
import {
  captured,
  cardFace,
  inTopic,
  matchesNote,
  newestFirst,
  noteColor,
  notePath,
  searchOf,
  topicChip,
  topicColor,
  topicOf,
  topicPath,
  topicTree,
  wikiResolver,
  writtenOn,
} from "../logic/notes.ts";
import { titleOf } from "../logic/views.ts";
import { useItems } from "../store/queries.ts";
import { NoteEditor } from "../ui/NoteEditor.tsx";
import { createNote } from "../ui/NoteForm.tsx";

/**
 * Notes → Notes (M14): the topics beside a capture bar and a masonry of cards tinted by topic.
 * `?topic=` opens one topic and its subtopics (Inbox also holds notes with no topic, Ideas the
 * ideas since seed migration 26); `/notes/all/<id>` opens a note in the editor.
 */
export function Notes({ id }: { id: string | undefined }) {
  const { local } = useCave();
  const all = useItems(local.db, NOTES);
  const search = useSearch();
  const topic = normFolder(new URLSearchParams(search).get("topic"));
  const [message, setMessage] = useState<string>();
  if (!all) return null;
  const notes = all.filter(isLive);
  const open = id ? notes.find((n) => n.id === id) : undefined;
  const back = topicPath(topic);

  if (id && !open)
    return (
      <p className="muted">
        No note “{id}”. <a href={back}>Back to notes</a>
      </p>
    );
  if (open)
    return (
      <NoteEditor
        key={open.id}
        note={open}
        backHref={back}
        resolve={wikiResolver(notes, notes)}
        onDeleted={() => {
          setMessage(`Deleted · ${titleOf(open)}`);
          navigate(back);
        }}
      />
    );
  return <NotesBoard notes={notes} topic={topic} message={message} />;
}

function NotesBoard({
  notes,
  topic,
  message,
}: {
  notes: Doc[];
  topic: string;
  message: string | undefined;
}) {
  const { local } = useCave();
  const today = useToday();
  const zone = useTimeZone();
  const keep = topic ? `?topic=${encodeURIComponent(topic)}` : "";
  const [text, setText] = useState("");
  const bar = useRef<HTMLTextAreaElement>(null);
  const query = searchOf(text);
  // A note captured in Inbox or All has no topic: that is what Inbox shows.
  const folder = topic === INBOX ? "" : topic;

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.defaultPrevented || isTyping(e.target)) return;
      e.preventDefault();
      setText((t) => t || "/");
      bar.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const capture = async () => {
    const note = captured(text);
    if (!note) return;
    // Cleared first, so a second Enter while the write runs can't save the note twice.
    setText("");
    await createNote(local, note.title, folder, note.body);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") setText("");
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (query === undefined) void capture();
  };
  const create = async () =>
    navigate(notePath(await createNote(local, "Untitled note", folder), keep));

  const shown = notes
    .filter((n) => inTopic(n, topic) && matchesNote(n, query ?? ""))
    .sort(newestFirst);
  const count = (t: string) => notes.filter((n) => inTopic(n, t)).length;
  const link = (path: string, emoji: string, name: string, n: number, depth = 0) => (
    <a
      key={path || "all"}
      href={topicPath(path)}
      className={`notes-topic${depth > 0 ? " sub" : ""}`}
      aria-current={path === topic ? "page" : undefined}
      style={{ "--c": topicColor(path), "--depth": depth } as CSSProperties}
    >
      {depth > 0 && <span className="notes-topic-branch" aria-hidden="true" />}
      {emoji ? (
        <span className="notes-topic-emoji" data-emoji={emoji} aria-hidden="true" />
      ) : (
        depth === 0 && <span className="notes-topic-dot" aria-hidden="true" />
      )}
      <span className="notes-topic-name">{name}</span>
      <span className="notes-topic-count num">{n}</span>
    </a>
  );

  return (
    <div className="notes">
      <nav className="notes-topics" aria-label="Topics">
        {link("", "🗂️", "All", notes.length)}
        {link(INBOX, "📥", INBOX, count(INBOX))}
        {link(IDEAS_TOPIC, "💡", IDEAS_TOPIC, count(IDEAS_TOPIC))}
        {topicTree(notes).map((r) => link(r.path, r.emoji, r.name, r.count, r.depth))}
      </nav>
      <section className="notes-main" aria-label="Notes">
        <div className="notes-capture">
          <label className="notes-bar">
            <span
              className="notes-bar-icon"
              data-emoji={query === undefined ? "💡" : "🔍"}
              aria-hidden="true"
            />
            <textarea
              ref={bar}
              aria-label="Capture or search"
              placeholder="Capture an idea, press Enter. Search with /"
              rows={Math.min(6, text.split("\n").length)}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
            />
          </label>
          <button type="button" className="btn primary notes-new" onClick={() => void create()}>
            + New note
          </button>
        </div>
        {message && (
          <p role="status" className="muted notes-message">
            {message}
          </p>
        )}
        {shown.length === 0 && (
          <p className="muted notes-message">
            {query
              ? `No note matches “${query}”.`
              : notes.length === 0
                ? "No notes yet. Type one above and press Enter."
                : "No notes here yet."}
          </p>
        )}
        <div className="notes-masonry">
          {shown.map((n) => (
            <NoteCard
              key={n.id}
              note={n}
              href={notePath(n.id, keep)}
              day={writtenOn(n.data._created, today, zone)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function NoteCard({ note, href, day }: { note: Doc; href: string; day: string }) {
  const chip = topicChip(topicOf(note));
  const face = cardFace(note.data._body);
  return (
    <a className="note-card" href={href} style={{ "--c": noteColor(note) } as CSSProperties}>
      <span className="note-card-topic">
        {chip.emoji && <span data-emoji={chip.emoji} aria-hidden="true" />}
        {chip.text}
      </span>
      <h3>{titleOf(note)}</h3>
      {face.text && <p>{face.text}</p>}
      {face.checks.length > 0 && (
        <ul className="note-card-checks">
          {face.checks.slice(0, 6).map((c, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: items can repeat; order is their identity
            <li key={i} className={c.done ? "done" : undefined}>
              <span className="note-card-box" aria-hidden="true">
                {c.done ? "✓" : ""}
              </span>
              <span className="sr">{c.done ? "Done: " : "To do: "}</span>
              {c.text}
            </li>
          ))}
        </ul>
      )}
      <span className="note-card-date">{day}</span>
    </a>
  );
}
