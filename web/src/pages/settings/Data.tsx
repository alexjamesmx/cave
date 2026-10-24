import { useEffect, useMemo, useState } from "react";
import type { Status } from "../../../../server/owner-api.ts";
import { useCave } from "../../app/context.ts";
import { ownerDownload, ownerGet } from "../../app/owner-api.ts";
import { ownerOf } from "../../app/sections.ts";
import { collectionStats } from "../../logic/system.ts";
import { useAllItems, useCollections } from "../../store/queries.ts";
import { Icon } from "../../ui/icon.tsx";
import { CollectionPage } from "../CollectionPage.tsx";
import { Import } from "./Import.tsx";
import { Panel, Row, when } from "./shared.tsx";
import { UndoHistory } from "./UndoHistory.tsx";

/**
 * Settings → Data: the export and the import, every collection raw with its views and the
 * field editor, and the undo history of agents' writes. `rest` opens one collection:
 * `/settings/data/<id>/<view>`.
 */
export function SettingsData({ rest }: { rest: string[] }) {
  const [id, view] = rest;
  if (id) return <CollectionPage key={id} id={id} viewId={view} />;
  return (
    <>
      <Export />
      <Import />
      <Collections />
      <UndoHistory />
    </>
  );
}

/** Every collection, with its live count and when it last changed on any device. */
function Collections() {
  const { db } = useCave().local;
  const collections = useCollections(db) ?? [];
  const items = useAllItems(db);
  const stats = useMemo(() => collectionStats(items ?? []), [items]);
  return (
    <Panel title="Collections">
      <span className="muted" style={{ fontSize: 13 }}>
        Every collection as stored, with its views and the field editor (statuses, stages and other
        lists are edited there). Counts are this device's copy.
      </span>
      {collections.map((c) => {
        const s = stats.get(c.id);
        return (
          <Row key={c.id}>
            <a
              className="link"
              href={`/settings/data/${encodeURIComponent(c.id)}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <Icon name={c.data.icon} size={16} color={c.data.color} />
              {c.data.name}
            </a>
            <span className="num">{s?.count ?? 0}</span>
            <span className="muted">last change {when(s?.lastChange)}</span>
            <span className="muted num" style={{ fontSize: 12, marginLeft: "auto" }}>
              {ownerOf(c.id)?.label ?? "Data only"}
            </span>
          </Row>
        );
      })}
    </Panel>
  );
}

/** The whole Cave as one JSON file, from the server. */
function Export() {
  const [status, setStatus] = useState<Status | "offline">();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void ownerGet<Status>("/api/status").then((s) => setStatus(s ?? "offline"));
  }, []);
  return (
    <Panel title="Export">
      <span className="muted" style={{ fontSize: 13 }}>
        Every doc, deleted ones included, as the server holds them. Agent tokens stay out.
        {typeof status === "object" && (
          <>
            {" "}
            The server holds <span className="num">{status.docs}</span> docs in database{" "}
            <span className="num">{status.dbId}</span>.
          </>
        )}
        {status === "offline" && " The server is not reachable from this device right now."}
      </span>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn"
          onClick={() => void ownerDownload("/api/export").then((ok) => setFailed(!ok))}
        >
          Download export
        </button>
        {failed && <span className="muted">The server refused or could not be reached.</span>}
      </div>
    </Panel>
  );
}
