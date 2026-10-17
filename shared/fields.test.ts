import { describe, expect, test } from "bun:test";
import { fieldsOf, isDateValue, validateFields } from "./fields.ts";
import type { Field } from "./schema.ts";
import { seedDocs } from "./seed.ts";

const money = fieldsOf(seedDocs().find((d) => d.id === "money"));
const tasks = fieldsOf(seedDocs().find((d) => d.id === "tasks"));
const keysOf = (fields: Field[], data: Record<string, unknown>) =>
  validateFields(fields, data).map((e) => e.key);

describe("isDateValue", () => {
  test("date-only fields accept YYYY-MM-DD and nothing else", () => {
    expect(isDateValue("2026-10-12", false)).toBe(true);
    expect(isDateValue("2026-10-12T10:00", false)).toBe(false);
    expect(isDateValue("2026-1-12", false)).toBe(false);
    expect(isDateValue(20261012, false)).toBe(false);
  });

  test("withTime accepts a date with optional minutes and seconds", () => {
    expect(isDateValue("2026-10-12", true)).toBe(true);
    expect(isDateValue("2026-10-12T09:30", true)).toBe(true);
    expect(isDateValue("2026-10-12T09:30:59", true)).toBe(true);
    expect(isDateValue("2026-10-12T09", true)).toBe(false);
    expect(isDateValue("2026-10-12T09:30Z", true)).toBe(false);
  });

  test("rejects impossible calendar dates and times", () => {
    expect(isDateValue("2026-02-29", false)).toBe(false);
    expect(isDateValue("2028-02-29", false)).toBe(true);
    expect(isDateValue("2026-13-01", false)).toBe(false);
    expect(isDateValue("2026-10-12T24:00", true)).toBe(false);
    expect(isDateValue("2026-10-12T23:60", true)).toBe(false);
  });
});

describe("validateFields", () => {
  test("a valid ledger entry passes", () => {
    const entry = {
      date: "2026-10-01T13:05:00",
      amount: 250,
      direction: "expense",
      category: "food",
      // Archived since M7c: old values stay, nothing checks them.
      detail: "Tacos",
    };
    expect(validateFields(money, entry)).toEqual([]);
    // Accounts are a list now; a fresh seed has none until the owner adds one.
    expect(keysOf(money, { account: "bank" })).toEqual(["account"]);
  });

  test("select values must be one of the options", () => {
    expect(keysOf(money, { category: "pets" })).toEqual(["category"]);
    expect(validateFields(money, { category: "pets" })[0]?.error).toContain("food");
  });

  test("numbers and money must be finite numbers", () => {
    expect(keysOf(money, { amount: Number.NaN })).toEqual(["amount"]);
    expect(keysOf(money, { amount: Number.POSITIVE_INFINITY })).toEqual(["amount"]);
    expect(keysOf(money, { amount: "250" })).toEqual(["amount"]);
  });

  test("date fields follow their withTime setting", () => {
    const dateOnly: Field[] = [{ id: "day", name: "Day", type: "date" }];
    expect(keysOf(dateOnly, { day: "2026-10-12T10:00" })).toEqual(["day"]);
    expect(keysOf(dateOnly, { day: "2026-10-12" })).toEqual([]);
    // A task's due takes a time since M7b, and a date alone still.
    expect(keysOf(tasks, { due: "2026-10-12T10:00" })).toEqual([]);
    expect(keysOf(money, { date: "2026-10-12T10:00" })).toEqual([]);
  });

  test("text and checkbox fields check their JS type", () => {
    expect(keysOf(tasks, { area: 3 })).toEqual(["area"]);
    const journal = fieldsOf(seedDocs().find((d) => d.id === "journal"));
    expect(keysOf(journal, { gym: "yes" })).toEqual(["gym"]);
    expect(keysOf(journal, { gym: true })).toEqual([]);
  });

  test("url fields accept only http, https and mailto links", () => {
    const fields: Field[] = [{ id: "link", name: "Link", type: "url" }];
    for (const ok of ["https://example.com/a?b=1", "http://localhost:3000", "mailto:a@b.c"]) {
      expect(keysOf(fields, { link: ok })).toEqual([]);
    }
    for (const bad of [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "data:text/html,x",
      "example.com",
      5,
    ]) {
      expect(keysOf(fields, { link: bad })).toEqual(["link"]);
    }
  });

  test("null clears any field; keys that are not fields are not checked", () => {
    expect(validateFields(money, { category: null, amount: null, date: null })).toEqual([]);
    expect(validateFields(money, { _title: "x", bucket: 1, confidence: "5" })).toEqual([]);
  });
});
