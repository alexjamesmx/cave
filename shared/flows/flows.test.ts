import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { allHold, holds } from "./conditions.ts";
import { FlowDefinitionSchema, isSensitive, parseDefinition, STEPS, TRIGGERS } from "./registry.ts";
import { latestSlot, nextSlot } from "./schedule.ts";
import { renderTemplate, templateErrors } from "./templates.ts";

const MX = "America/Mexico_City";
const iso = (ms: number | undefined) => (ms === undefined ? undefined : new Date(ms).toISOString());

const rent = {
  version: 1,
  trigger: { type: "schedule", every: "month", day: 22, at: "09:00" },
  steps: [
    { type: "create", collection: "tasks", title: "Pay rent", fields: { priority: "high" } },
    { type: "notify", title: "Rent is due", open: "created-item" },
  ],
};
const salary = {
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

describe("definition validation", () => {
  test("every trigger and step type is accepted in its documented shape", () => {
    expect(parseDefinition(rent).ok).toBe(true);
    expect(parseDefinition(salary).ok).toBe(true);
    const changed = {
      version: 1,
      trigger: { type: "item-changed", collection: "tasks", field: "status", to: "done" },
      steps: [{ type: "update-trigger-item", fields: { completed: "{{today}}" } }],
    };
    expect(parseDefinition(changed).ok).toBe(true);
    for (const every of [
      { every: "day", at: "07:30" },
      { every: "week", weekday: 1, at: "07:30" },
      { every: "year", month: 2, day: 29, at: "07:30" },
    ]) {
      expect(parseDefinition({ ...rent, trigger: { type: "schedule", ...every } }).ok).toBe(true);
    }
  });

  test("unknown types, extra keys, too many steps and missing schedule parts are refused", () => {
    const bad = [
      { ...rent, version: 2 },
      { ...rent, trigger: { type: "webhook", url: "https://x" } },
      { ...rent, steps: [{ type: "http", url: "https://x" }] },
      { ...rent, steps: [] },
      { ...rent, steps: Array.from({ length: 11 }, () => rent.steps[1]) },
      { ...rent, trigger: { ...rent.trigger, cron: "* * * * *" } },
      { ...rent, trigger: { type: "schedule", every: "month", at: "09:00" } },
      { ...rent, trigger: { type: "schedule", every: "week", at: "09:00" } },
      { ...rent, trigger: { type: "schedule", every: "day", at: "25:00" } },
      { ...rent, steps: [{ type: "notify", title: "x", open: "elsewhere" }] },
      { ...rent, steps: [{ type: "if", all: [{ field: "amount", op: ">" }] }] },
      { ...rent, steps: [{ type: "create", collection: "tasks", title: "{{item.amount * 2}}" }] },
      { ...rent, steps: [{ type: "create", collection: "../x", title: "t" }] },
    ];
    for (const def of bad) expect({ def, ok: parseDefinition(def).ok }).toEqual({ def, ok: false });
  });

  test("a flow is sensitive when any step changes existing items", () => {
    const parsed = parseDefinition(rent);
    expect(parsed.ok && isSensitive(parsed.value)).toBe(false);
    expect(
      isSensitive({
        version: 1,
        trigger: { type: "item-added", collection: "money" },
        steps: [{ type: "update-trigger-item", fields: { category: "food" } }],
      }),
    ).toBe(true);
    expect(STEPS.filter((s) => s.sensitive).map((s) => s.type)).toEqual(["update-trigger-item"]);
  });

  test("the registry is the one source: every listed type has a schema branch", () => {
    for (const spec of [...TRIGGERS, ...STEPS]) expect(spec.describe({}).length).toBeGreaterThan(0);
    const json = JSON.stringify(z.toJSONSchema(FlowDefinitionSchema, { unrepresentable: "any" }));
    for (const spec of [...TRIGGERS, ...STEPS]) expect(json).toContain(`"${spec.type}"`);
  });
});

describe("templates", () => {
  const ctx = {
    item: { _title: "Salary", amount: 15999.99, note: "x" },
    today: "2026-10-15",
    month: "2026-10",
  };
  test("titles, fields, dates and pct render; a missing field is empty", () => {
    expect(renderTemplate("Move {{item.amount|pct:20}} to invest", ctx)).toBe(
      "Move 3200 to invest",
    );
    expect(renderTemplate("{{item.amount|pct:12.5}}", ctx)).toBe("2000");
    expect(renderTemplate("{{ item.title }} on {{today}} ({{month}})", ctx)).toBe(
      "Salary on 2026-10-15 (2026-10)",
    );
    expect(renderTemplate("[{{item.missing}}]", ctx)).toBe("[]");
    expect(renderTemplate("{{item.note|pct:10}}", ctx)).toBe("");
    expect(renderTemplate("{{item.amount|pct:33}}", { ...ctx, item: { amount: 100 } })).toBe("33");
    expect(renderTemplate("{{item.amount|pct:33.33}}", { ...ctx, item: { amount: 10 } })).toBe(
      "3.33",
    );
  });

  test("anything else in braces is an error", () => {
    expect(templateErrors("Pay {{item.amount}} on {{today}}")).toEqual([]);
    for (const t of [
      "{{now}}",
      "{{item.title|pct:2}}",
      "{{item.a.b}}",
      "{{ item.amount * 2 }}",
      "{{x",
      "a}}",
    ])
      expect(templateErrors(t).length).toBeGreaterThan(0);
  });
});

describe("conditions", () => {
  const item = { _title: "Uber", amount: 200, direction: "income", note: "" };
  test("numbers compare as numbers, text as text, and empty is its own test", () => {
    expect(holds({ field: "amount", op: ">=", value: 100 }, item)).toBe(true);
    expect(holds({ field: "amount", op: ">", value: "1000" }, item)).toBe(false);
    expect(holds({ field: "direction", op: "=", value: "income" }, item)).toBe(true);
    expect(holds({ field: "title", op: "contains", value: "ub" }, item)).toBe(true);
    expect(holds({ field: "note", op: "empty" }, item)).toBe(true);
    expect(holds({ field: "category", op: "!=", value: "food" }, item)).toBe(true);
    expect(holds({ field: "category", op: "=", value: "food" }, item)).toBe(false);
    expect(
      allHold(
        [
          { field: "amount", op: "<", value: 300 },
          { field: "note", op: "not-empty" },
        ],
        item,
      ),
    ).toBe(false);
    expect(allHold(undefined, item)).toBe(true);
  });
});

describe("schedule slots", () => {
  const at = (s: string) => Date.parse(s);
  test("daily and weekly in the settings timezone", () => {
    const daily = { type: "schedule" as const, every: "day" as const, at: "09:00" };
    expect(iso(latestSlot(daily, at("2026-10-15T16:00:00Z"), MX))).toBe("2026-10-15T15:00:00.000Z");
    expect(iso(latestSlot(daily, at("2026-10-15T14:00:00Z"), MX))).toBe("2026-10-14T15:00:00.000Z");
    expect(iso(nextSlot(daily, at("2026-10-15T16:00:00Z"), MX))).toBe("2026-10-16T15:00:00.000Z");
    const monday = { type: "schedule" as const, every: "week" as const, weekday: 1, at: "08:00" };
    expect(iso(nextSlot(monday, at("2026-10-15T16:00:00Z"), MX))).toBe("2026-10-19T14:00:00.000Z");
  });

  test("monthly clamps the 31st to short months; yearly handles Feb 29", () => {
    const month31 = { type: "schedule" as const, every: "month" as const, day: 31, at: "09:00" };
    expect(iso(nextSlot(month31, at("2026-11-01T00:00:00Z"), MX))).toBe("2026-11-30T15:00:00.000Z");
    expect(iso(nextSlot(month31, at("2027-02-01T00:00:00Z"), MX))).toBe("2027-02-28T15:00:00.000Z");
    expect(iso(nextSlot(month31, at("2027-03-01T00:00:00Z"), MX))).toBe("2027-03-31T15:00:00.000Z");
    const leap = {
      type: "schedule" as const,
      every: "year" as const,
      month: 2,
      day: 29,
      at: "09:00",
    };
    expect(iso(nextSlot(leap, at("2026-03-01T00:00:00Z"), MX))).toBe("2027-02-28T15:00:00.000Z");
  });
});
