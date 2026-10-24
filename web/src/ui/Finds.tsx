import { useState } from "react";
import { newId } from "../../../shared/ids.ts";
import {
  domainOf,
  formatInterests,
  type Interest,
  interestsOf,
  matchedInterests,
  parseInterests,
  RADAR,
  radarTabs,
  saveWrites,
} from "../../../shared/radar.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { navigate, setSearch, useSearch } from "../app/router.ts";
import { titleOf } from "../logic/views.ts";
import { useDoc, useItems } from "../store/queries.ts";
import { Icon } from "./icon.tsx";

const TABS = [
  { id: "for-you", label: "For you" },
  { id: "all", label: "All" },
  { id: "saved", label: "Saved" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const SETTINGS = { id: "settings", kind: "setting" as const, collection: null };
const notePath = (id: string) => `/projects/notes/${encodeURIComponent(id)}`;

/**
 * Agent finds (Projects → Ideas, the "Agent finds" bucket; the Radar page until M11 part 8):
 * what agents found, ranked by the owner's interests, which are edited at the top. Save makes
 * one Inbox note per finding (optionally on a project); Dismiss hides it. Works offline.
 */
export function Finds({ withInterests = true }: { withInterests?: boolean }) {
  const { local } = useCave();
  const items = useItems(local.db, RADAR);
  const settings = useDoc(local.db, "settings");
  const interests = interestsOf(settings?.data);
  const tabs = radarTabs(items ?? [], interests);
  const search = useSearch();
  const tab = (new URLSearchParams(search).get("tab") ?? "for-you") as TabId;
  if (!items) return null;
  const listed = tab === "all" ? tabs.all : tab === "saved" ? tabs.saved : tabs.forYou;
  const counts: Record<TabId, number> = {
    "for-you": tabs.forYou.length,
    all: tabs.all.length,
    saved: tabs.saved.length,
  };
  const pickTab = (id: TabId) => {
    const next = new URLSearchParams(search);
    if (id === "for-you") next.delete("tab");
    else next.set("tab", id);
    const s = next.toString();
    setSearch(s ? `?${s}` : "");
  };

  return (
    <section
      className="panel"
      aria-label="Agent finds"
      style={{ padding: 18, display: "grid", gap: 12 }}
    >
      {withInterests && <Interests />}
      <nav aria-label="Finds tabs" className="buckets">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className="chip"
            aria-pressed={t.id === tab}
            onClick={() => pickTab(t.id)}
          >
            {t.label} <span className="num">{counts[t.id]}</span>
          </button>
        ))}
      </nav>
      {items.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Nothing found yet. Agents fill this. Ask Claude: find this week's AI news for my radar.
        </p>
      ) : listed.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          {tab === "saved" ? "Nothing saved yet." : "Nothing new here."}
        </p>
      ) : (
        <ul aria-label="Findings" style={{ margin: 0, padding: 0, display: "grid" }}>
          {listed.map((d) => (
            <Finding key={d.id} item={d} interests={interests} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** The interests that rank the finds: one per line, as Name: keyword, keyword. */
function Interests() {
  const { local } = useCave();
  const settings = useDoc(local.db, "settings");
  const text = formatInterests(interestsOf(settings?.data));
  return (
    <details className="interests">
      <summary className="k">Interests</summary>
      <label style={{ display: "grid", gap: 6, marginTop: 8 }}>
        <span className="sr">Radar interests</span>
        <textarea
          key={text}
          className="input"
          rows={5}
          defaultValue={text}
          onBlur={(e) => {
            const next = parseInterests(e.target.value);
            if (formatInterests(next) !== text)
              void local.write(SETTINGS, { radarInterests: next });
          }}
        />
      </label>
      <span className="muted" style={{ fontSize: 13 }}>
        One per line, as Name: keyword, keyword. A finding matches when an agent tags it with the
        name or a keyword is a whole word of its title or domain.
      </span>
    </details>
  );
}

function Finding({ item, interests }: { item: Doc; interests: Interest[] }) {
  const { local } = useCave();
  const projects = useItems(local.db, "projects");
  const stored = useDoc(local.db, typeof item.data.note === "string" ? item.data.note : undefined);
  const note = stored?.data._deleted === true ? undefined : stored;
  const [project, setProject] = useState("");
  const url = typeof item.data.url === "string" ? item.data.url : "";
  const chips = matchedInterests(item, interests);
  const meta = [domainOf(url), typeof item.data.source === "string" ? item.data.source : ""]
    .filter(Boolean)
    .join(" · ");

  const save = async () => {
    const writes = saveWrites(item, note, () => newId(), project || undefined);
    if (writes.length === 0 && note) return navigate(notePath(note.id));
    for (const w of writes)
      await local.write({ id: w.id, kind: "item", collection: w.collection }, w.patch);
  };
  const dismiss = () =>
    local.write({ id: item.id, kind: "item", collection: RADAR }, { status: "dismissed" });

  return (
    <li
      aria-label={titleOf(item)}
      style={{
        listStyle: "none",
        display: "grid",
        gap: 6,
        padding: "12px 0",
        borderTop: "1px solid var(--line)",
      }}
    >
      {url ? (
        <a className="link" href={url} target="_blank" rel="noopener noreferrer">
          {titleOf(item)}
        </a>
      ) : (
        <span>{titleOf(item)}</span>
      )}
      {meta && (
        <span className="num muted" style={{ fontSize: 12, textTransform: "uppercase" }}>
          {meta}
        </span>
      )}
      {typeof item.data.why === "string" && item.data.why && (
        <span style={{ fontSize: 14 }}>{item.data.why}</span>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {chips.map((c) => (
          <span key={c} className="chip" style={{ background: "var(--on)" }}>
            {c}
          </span>
        ))}
        <span style={{ flex: 1 }} />
        {item.data.status === "saved" && note ? (
          <a className="btn" href={notePath(note.id)}>
            <Icon name="notebook" size={15} /> Open note
          </a>
        ) : (
          <>
            {(projects?.length ?? 0) > 0 && (
              <select
                className="input"
                aria-label="Save to project"
                value={project}
                onChange={(e) => setProject(e.target.value)}
                style={{ width: "auto" }}
              >
                <option value="">Inbox only</option>
                {projects?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {titleOf(p)}
                  </option>
                ))}
              </select>
            )}
            <button type="button" className="btn" onClick={() => void save()}>
              <Icon name="bookmark" size={15} /> Save
            </button>
            {item.data.status !== "dismissed" && (
              <button type="button" className="btn" onClick={() => void dismiss()}>
                <Icon name="x" size={15} /> Dismiss
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}
