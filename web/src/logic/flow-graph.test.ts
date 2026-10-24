import { expect, test } from "bun:test";
import { type FlowDefinition, parseDefinition } from "../../../shared/flows/registry.ts";
import { addStep, blankPart, replaceStep, withParam } from "./flow-edit.ts";
import { COLUMN, flowGraph, selectionOf, stepId, TRIGGER_ID } from "./flow-graph.ts";

const salary: FlowDefinition = {
  version: 1,
  trigger: {
    type: "item-added",
    collection: "money",
    where: [{ field: "direction", op: "=", value: "income" }],
  },
  steps: [
    { type: "if", all: [{ field: "amount", op: ">=", value: 15000 }] },
    { type: "create", collection: "tasks", title: "Move {{item.amount|pct:20}} to invest" },
  ],
};

test("the trigger sits left, steps follow in order, an if branches to stop", () => {
  const { nodes, edges } = flowGraph(salary, 1);
  expect(nodes.map((n) => [n.id, n.type, n.position.x])).toEqual([
    [TRIGGER_ID, "part", 0],
    ["step-0", "part", COLUMN],
    ["stop-0", "stop", COLUMN],
    ["step-1", "part", COLUMN * 2],
  ]);
  expect(edges.map((e) => [e.source, e.target, e.label])).toEqual([
    [TRIGGER_ID, "step-0", undefined],
    ["step-0", "stop-0", "else"],
    ["step-0", "step-1", undefined],
  ]);
  const parts = nodes.filter((n) => n.type === "part");
  expect(parts.map((n) => (n.data as { selected: boolean }).selected)).toEqual([
    false,
    false,
    true,
  ]);
  expect(parts.map((n) => (n.data as { text: string }).text)).toEqual([
    "When an item is added to money where direction = income",
    "If amount >= 15000, else stop",
    "Create “Move {{item.amount|pct:20}} to invest” in tasks",
  ]);
  expect(selectionOf(TRIGGER_ID)).toBe("trigger");
  expect(selectionOf(stepId(1))).toBe(1);
  expect(selectionOf("stop-0")).toBeUndefined();
});

test("the canvas never touches the definition: an edit through the inspector round-trips byte for byte", () => {
  const before = JSON.stringify(salary);
  flowGraph(salary, "trigger");
  expect(JSON.stringify(salary)).toBe(before);
  // The same helpers the form editor uses, then the same parse the server does.
  const step = salary.steps[0];
  if (step?.type !== "if") throw new Error("fixture");
  const edited = addStep(
    replaceStep(salary, 0, withParam(step, "all", [{ field: "amount", op: ">=", value: 100 }])),
    blankPart("step", "notify", "money"),
  );
  const parsed = parseDefinition(edited);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(JSON.stringify(parsed.value)).toBe(JSON.stringify(edited));
  expect(flowGraph(parsed.value, 2).nodes.map((n) => n.id)).toEqual([
    TRIGGER_ID,
    "step-0",
    "stop-0",
    "step-1",
    "step-2",
  ]);
});
