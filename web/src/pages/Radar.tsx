import { useState } from "react";
import { newId } from "../../../shared/ids.ts";
import {
  domainOf,
  type Interest,
  interestsOf,
  matchedInterests,
  RADAR,
  radarTabs,
  saveWrites,
} from "../../../shared/radar.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { navigate, setSearch, useSearch } from "../app/router.ts";
import { titleOf } from "../logic/views.ts";
import { useDoc, useItems } from "../store/queries.ts";
import { Icon } from "../ui/icon.tsx";

const TABS = [
  { id: "for-you", label: "For you" },
  { id: "all", label: "All" },
  { id: "saved", label: "Saved" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const notePath = (id: string) => `/projects/notes/${encodeURIComponent(id)}`;

export function useRadar() {
  const { local } = useCave();
  const items = useItems(local.db, RADAR);
  const settings = useDoc(local.db, "settings");
  const interests = interestsOf(settings?.data);
  return { items, interests, tabs: radarTabs(items ?? [], interests) };
}

/**
 * Projects → Radar: what agents found, ranked by the owner's interests. Save makes one
 * Inbox note per finding (optionally on a project); Dismiss hides it. Works offline.
 */
export function RadarPage() {
  const { items, interests, tabs } = useRadar();
  const search = useSearch();
  const tab = (new URLSearchParams(search).get("tab") ?? "for-you") as TabId;
  if (!items) return null;
  const listed = tab === "all" ? tabs.all : tab === "saved" ? tabs.saved : tabs.forYou;
  const counts: Record<TabId, number> = {
    "for-you": tabs.forYou.length,
    all: tabs.all.length,
    saved: tabs.saved.length,
  };

  return (
    <section className="panel" aria-label="Radar" style={{ padding: 18, display: "grid", gap: 12 }}>
      <nav aria-label="Radar tabs" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className="chip"
            aria-pressed={t.id === tab}
            onClick={() => setSearch(t.id === "for-you" ? "" : `?tab=${t.id}`)}
            style={{
              cursor: "pointer",
              border: 0,
              color: t.id === tab ? "var(--on-lime)" : "var(--text)",
              background: t.id === tab ? "var(--lime)" : "#11141a",
            }}
          >
            {t.label} <span className="num">{counts[t.id]}</span>
          </button>
        ))}
      </nav>
      {items.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Nothing on the radar yet. Agents fill it. Ask Claude: find this week's AI news for my
          radar.
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

/** Home's card: the three newest For you findings. */
export function RadarCard() {
  const { tabs } = useRadar();
  const top = tabs.forYou.slice(0, 3);
  if (top.length === 0) return null;
  return (
    <section className="panel" aria-label="Radar" style={{ padding: 16, display: "grid", gap: 6 }}>
      <a className="k" href="/projects/radar" style={{ textDecoration: "none" }}>
        Radar
      </a>
      {top.map((d) => {
        const url = typeof d.data.url === "string" ? d.data.url : "";
        return (
          <span key={d.id} style={{ display: "flex", gap: 8, alignItems: "baseline", minWidth: 0 }}>
            <a className="link" href={url} target="_blank" rel="noopener noreferrer">
              {titleOf(d)}
            </a>
            <span className="num muted" style={{ fontSize: 11 }}>
              {domainOf(url)}
            </span>
          </span>
        );
      })}
    </section>
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
        borderTop: "1px solid var(--line, #161A21)",
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
          <span key={c} className="chip" style={{ background: "#11141a" }}>
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
