import { isDocId } from "../shared/ids.ts";
import { isAuthorized } from "./auth.ts";
import type { Store } from "./store.ts";

/** Most changes the item drawer shows; older history stays in the log for undo. */
export const HISTORY_LIMIT = 200;

export function createHistoryHandler({
  store,
  token,
}: {
  store: Store;
  token: string | undefined;
}) {
  return (req: Request & { params: { id: string } }): Response => {
    if (token !== undefined && !isAuthorized(req, token)) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    const { id } = req.params;
    if (!isDocId(id)) return Response.json({ error: "bad id" }, { status: 400 });
    return Response.json({ changes: store.changesFor(id, HISTORY_LIMIT) });
  };
}
