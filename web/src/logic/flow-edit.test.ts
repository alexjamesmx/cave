import { expect, test } from "bun:test";
import { SEEDED_FLOWS } from "../../../shared/flows/drafts.ts";
import { MAX_STEPS, parseDefinition, STEPS, TRIGGERS } from "../../../shared/flows/registry.ts";
import { FLOWS_COLLECTION } from "../../../shared/flows/seed.ts";
import {
  addStep,
  blankFlow,
  blankPart,
  copyData,
  moveStep,
  removeStep,
  templateTokens,
  withParam,
} from "./flow-edit.ts";

test("every trigger and step the registry has gets a blank that validates", () => {
  for (const spec of TRIGGERS) {
    const def = { ...blankFlow(), trigger: blankPart("trigger", spec.type, "tasks") };
    expect(parseDefinition(def)).toMatchObject({ ok: true });
  }
  const itemTrigger = { ...blankFlow(), trigger: blankPart("trigger", "item-added", "tasks") };
  for (const spec of STEPS) {
    const def = { ...itemTrigger, steps: [blankPart("step", spec.type, "tasks")] };
    expect(parseDefinition(def)).toMatchObject({ ok: true });
  }
});

test("a cleared optional parameter is removed, not stored empty", () => {
  const t = blankPart("trigger", "schedule", "tasks");
  expect(withParam(withParam(t, "day", 22), "day", undefined)).toEqual(t);
  expect(withParam(t, "at", "07:30")).toMatchObject({ at: "07:30" });
});

test("steps stay between 1 and the limit, and move within bounds", () => {
  const one = blankFlow();
  expect(removeStep(one, 0)).toBe(one);
  let full = one;
  for (let i = 0; i < MAX_STEPS + 2; i++) full = addStep(full, blankPart("step", "notify", "x"));
  expect(full.steps).toHaveLength(MAX_STEPS);
  const two = addStep(one, blankPart("step", "create", "tasks"));
  expect(moveStep(two, 1, -1).steps.map((s) => s.type)).toEqual(["create", "notify"]);
  expect(moveStep(two, 1, 1)).toBe(two);
});

test("the template picker offers the trigger item's fields, and pct for numbers", () => {
  const salary = SEEDED_FLOWS[1]?.data.definition;
  if (!salary) throw new Error("seed");
  const fields = [
    { id: "amount", name: "Amount", type: "money" as const },
    { id: "direction", name: "Direction", type: "select" as const },
  ];
  expect(templateTokens(salary, fields)).toEqual([
    "item.title",
    "item.amount",
    "item.direction",
    "item.amount|pct:20",
    "today",
    "month",
  ]);
  expect(templateTokens(blankFlow(), fields)).toEqual(["today", "month"]);
});

test("a copy is an owner's draft", () => {
  const rent = SEEDED_FLOWS[0]?.data;
  if (!rent) throw new Error("seed");
  expect(copyData({ ...rent, status: "on", author: "claude" })).toEqual({
    _title: "Copy of Rent reminder",
    _body: rent._body,
    status: "draft",
    definition: rent.definition,
    author: "owner",
  });
  expect(FLOWS_COLLECTION.fields.map((f) => f.id)).toEqual(["status", "definition", "author"]);
});
