import { beforeEach, expect, test } from "bun:test";
import type { FlowDefinition } from "../../shared/flows/registry.ts";
import { formatStamp } from "../../shared/hlc.ts";
import { seedDocs } from "../../shared/seed.ts";
import type { Doc } from "../../shared/types.ts";
import { openDb } from "../db.ts";
import { createChannelWriter } from "../notify/channel-writer.ts";
import type { Notifier } from "../notify/notifier.ts";
import type { Approvals } from "../notify/telegram.ts";
import type { Notification } from "../notify/types.ts";
import { createStore, type Store } from "../store.ts";
import { createApprovals } from "./approvals.ts";

const NOW = Date.parse("2026-10-15T16:00:00Z");
let store: Store;
let approvals: Approvals;
let notified: Notification[];
let tick = 1;

const notifier: Notifier = {
  statuses: () => [],
  async notify(n) {
    notified.push(n);
    return { delivered: 1, failed: 0 };
  },
};

const archive: FlowDefinition = {
  version: 1,
  trigger: { type: "item-changed", collection: "tasks", field: "status", to: "done" },
  steps: [{ type: "update-trigger-item", fields: { area: "archive" } }],
};

function write(id: string, data: Record<string, unknown>, actor = "agent:claude") {
  const stamp = formatStamp(NOW, tick++, "test");
  const doc: Doc = {
    id,
    kind: "item",
    collection: "flows",
    data,
    stamps: Object.fromEntries(Object.keys(data).map((k) => [k, stamp])),
    actor,
  };
  store.applyChanges([doc], actor, NOW);
}

beforeEach(() => {
  store = createStore(openDb(":memory:"));
  store.seedIfEmpty(seedDocs(), 1);
  notified = [];
  approvals = createApprovals({
    store,
    notifier,
    writer: createChannelWriter(store, "telegram", () => NOW),
    log: () => {},
  });
});

test("a flow saved as pending approval tells the owner once, with Approve and Reject", () => {
  write("f1", { _title: "Archive done tasks", status: "pending-approval", definition: archive });
  write("f1", { _title: "Archive finished tasks" });
  expect(notified).toEqual([
    {
      key: expect.stringMatching(/^flow-approval:f1:\d+$/),
      kind: "flow",
      itemId: "f1",
      title: "Approve flow: Archive done tasks",
      details: ["When status changes in tasks to done", "Change the trigger item: area"],
      path: "/flows/f1",
      actions: [
        { id: "approve", label: "Approve", path: "/flows/f1?do=approve" },
        { id: "reject", label: "Reject", path: "/flows/f1?do=reject" },
      ],
    },
  ]);
});

test("approve turns a pending flow on as channel:telegram; reject turns it off", () => {
  write("f1", { _title: "A", status: "pending-approval", definition: archive });
  write("f2", { _title: "B", status: "pending-approval", definition: archive });
  expect(approvals.decide("f1", true)).toBe("Turned on: A");
  expect(store.get("f1")?.data.status).toBe("on");
  expect(store.changesFor("f1", 1)[0]?.actor).toBe("channel:telegram");
  expect(approvals.decide("f2", false)).toBe("Rejected: B (off)");
  expect(store.get("f2")?.data.status).toBe("off");
});

test("only a flow waiting for approval can be decided", () => {
  write("f1", { _title: "A", status: "draft", definition: archive }, "owner");
  expect(approvals.decide("f1", true)).toBe("That flow isn't waiting for approval.");
  expect(approvals.decide("nope", true)).toBe("That flow is gone.");
  expect(approvals.decide("tasks", true)).toBe("That flow is gone.");
  expect(store.get("f1")?.data.status).toBe("draft");
});
