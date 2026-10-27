import { expect, test } from "bun:test";
import type { FlowDefinition } from "../../../shared/flows/registry.ts";
import {
  type BoardFlow,
  boardGraph,
  boardTarget,
  GROUP_PREFIX,
  groupFlows,
  JOB_PREFIX,
  laneId,
} from "./flow-board.ts";

const salary: FlowDefinition = {
  version: 1,
  trigger: { type: "item-added", collection: "money" },
  steps: [
    { type: "if", all: [{ field: "amount", op: ">=", value: 15000 }] },
    { type: "create", collection: "tasks", title: "Invest" },
  ],
};
const rent: FlowDefinition = {
  version: 1,
  trigger: { type: "schedule", every: "month", at: "09:00", day: 22 },
  steps: [{ type: "notify", title: "Pay rent", open: "calendar" }],
};
const flows: BoardFlow[] = [
  { id: "salary", title: "Salary → save", status: "on", def: salary },
  { id: "rent", title: "Rent", status: "draft", def: rent },
  { id: "broken", title: "Broken", status: "draft", def: undefined },
  { id: "bills", title: "Bills", status: "off", def: { ...rent, steps: [] } },
];
const name = (id: string) => (id === "money" ? "Money" : id);

test("flows group by what starts them: the schedule, each collection, then the broken ones", () => {
  const groups = groupFlows(flows, name);
  expect(groups.map((g) => [g.label, g.flows.map((f) => f.id)])).toEqual([
    ["On a schedule", ["bills", "rent"]],
    ["Money", ["salary"]],
    ["Needs fixing", ["broken"]],
  ]);
});

test("each lane is its card then the flow's parts, inside its group's frame", () => {
  const { nodes, edges } = boardGraph({
    groups: groupFlows(flows, name),
    jobs: [{ id: "backups", label: "Daily backup", schedule: "hourly" }],
    selection: undefined,
    draft: undefined,
    canAdd: true,
  });
  const ids = nodes.map((n) => n.id);
  expect(ids.filter((id) => id.startsWith(GROUP_PREFIX))).toEqual([
    "group:schedule",
    "group:c:money",
    "group:broken",
    "group:jobs",
  ]);
  expect(ids).toContain(laneId("salary", "card"));
  expect(ids).toContain(laneId("salary", "stop-0"));
  expect(ids).toContain(`${JOB_PREFIX}backups`);
  // A broken flow keeps its card, with no parts; no lane has a + until one is selected.
  expect(ids.filter((id) => id.startsWith("broken/"))).toEqual([laneId("broken", "card")]);
  expect(ids.some((id) => id.endsWith("/add"))).toBe(false);
  // Every node but the frames sits in a frame, the frames come first.
  for (const n of nodes)
    if (!n.id.startsWith(GROUP_PREFIX))
      expect(ids.indexOf(n.parentId as string)).toBeLessThan(ids.indexOf(n.id));
  // A flow that is on moves along its edges, else branch aside; one that is off does not.
  const salaryEdges = edges.filter((e) => e.id.startsWith("salary/"));
  expect(salaryEdges.map((e) => [e.source, e.target, e.animated])).toEqual([
    ["salary/card", "salary/trigger", true],
    ["salary/trigger", "salary/step-0", true],
    ["salary/step-0", "salary/stop-0", false],
    ["salary/step-0", "salary/step-1", true],
  ]);
  expect(edges.filter((e) => e.id.startsWith("rent/")).every((e) => !e.animated)).toBe(true);
});

test("the selected flow shows its draft and its +; its open part is marked", () => {
  const draft: FlowDefinition = {
    ...rent,
    steps: [...rent.steps, { type: "email", subject: "x", body: "" }],
  };
  const { nodes } = boardGraph({
    groups: groupFlows(flows, name),
    jobs: [],
    selection: { flow: "rent", part: 1, adding: false },
    draft,
    canAdd: true,
  });
  const lane = nodes.filter((n) => n.id.startsWith("rent/"));
  expect(lane.map((n) => n.id)).toEqual([
    "rent/card",
    "rent/trigger",
    "rent/step-0",
    "rent/step-1",
    "rent/add",
  ]);
  const selected = lane.filter((n) => (n.data as { selected?: boolean }).selected);
  expect(selected.map((n) => n.id)).toEqual(["rent/card", "rent/step-1"]);
  expect(nodes.some((n) => n.id === "salary/add")).toBe(false);
});

test("a click selects a flow, one of its parts, or a job; frames and stops select nothing", () => {
  expect(boardTarget("salary/card")).toEqual({ flow: "salary" });
  expect(boardTarget("salary/trigger")).toEqual({ flow: "salary", part: "trigger" });
  expect(boardTarget("salary/step-1")).toEqual({ flow: "salary", part: 1 });
  expect(boardTarget("job:backups")).toEqual({ job: "backups" });
  expect(boardTarget("salary/stop-0")).toBeUndefined();
  expect(boardTarget("group:c:money")).toBeUndefined();
});
