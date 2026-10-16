import { describeFlow } from "../../shared/flows/describe.ts";
import { parseDefinition } from "../../shared/flows/registry.ts";
import { FLOWS } from "../../shared/flows/seed.ts";
import type { Doc } from "../../shared/types.ts";
import type { ChannelWriter } from "../notify/channel-writer.ts";
import type { Notifier } from "../notify/notifier.ts";
import type { Approvals } from "../notify/telegram.ts";
import type { Store } from "../store.ts";

/**
 * A flow's id and a digest of its definition, so a button approves only the definition it was
 * shown with: one re-saved since then needs a new approval. Under Telegram's 64 bytes.
 */
export function approvalRef(flow: Doc): string {
  const digest = new Bun.CryptoHasher("sha256")
    .update(JSON.stringify(flow.data.definition ?? null))
    .digest("hex");
  return `${flow.id}.${digest.slice(0, 16)}`;
}

export interface ApprovalOptions {
  store: Store;
  notifier: Notifier;
  /** Telegram's writer: an approval from a chat is recorded as `channel:telegram`. */
  writer: ChannelWriter;
  log?: (line: string) => void;
}

/**
 * Flows an agent saved with a sensitive step wait as `pending-approval`. The owner is told
 * on every save that leaves one waiting with a new status or definition, and can approve or
 * reject from the app or, with the toggle on, Telegram.
 */
export function createApprovals({ store, notifier, writer, log = console.log }: ApprovalOptions) {
  store.onApplied((changes) => {
    for (const { doc, seq, keys, actor } of changes) {
      if (doc.collection !== FLOWS || actor === "seed") continue;
      if (!keys.includes("status") && !keys.includes("definition")) continue;
      if (doc.data.status !== "pending-approval" || doc.data._deleted === true) continue;
      const parsed = parseDefinition(doc.data.definition);
      notifier
        .notify({
          key: `flow-approval:${doc.id}:${seq}`,
          kind: "flow",
          itemId: approvalRef(doc),
          title: `Approve flow: ${String(doc.data._title ?? "Untitled")}`,
          details: parsed.ok ? describeFlow(parsed.value) : [],
          path: `/flows/${doc.id}`,
          actions: [
            { id: "approve", label: "Approve", path: `/flows/${doc.id}?do=approve` },
            { id: "reject", label: "Reject", path: `/flows/${doc.id}?do=reject` },
          ],
        })
        .catch((error) => log(`approval notice failed: ${(error as Error).name}`));
    }
  });

  const approvals: Approvals = {
    ref: approvalRef,
    decide(ref, approve) {
      const id = ref.split(".")[0] ?? "";
      const flow = store.get(id);
      if (flow?.collection !== FLOWS || flow.data._deleted === true) return "That flow is gone.";
      if (flow.data.status !== "pending-approval") return "That flow isn't waiting for approval.";
      const title = String(flow.data._title ?? "Untitled");
      // Rejecting is always safe; approving needs the definition the owner was shown.
      if (approve && ref !== approvalRef(flow))
        return `“${title}” changed since this message; check it in the app or with /flows.`;
      if (approve && !parseDefinition(flow.data.definition).ok)
        return `“${title}” has an invalid definition; open it in the app.`;
      writer.update(flow, { status: approve ? "on" : "off" });
      return approve ? `Turned on: ${title}` : `Rejected: ${title} (off)`;
    },
  };
  return approvals;
}
