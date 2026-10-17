import { expect, test } from "bun:test";
import { localDate } from "../../../shared/dates.ts";
import { pick, shown } from "./follow.ts";

const TZ = "America/Mexico_City";

test("a view that follows today moves to the new day at midnight", () => {
  const before = localDate(new Date("2026-09-02T05:59:00Z"), TZ);
  const after = localDate(new Date("2026-09-02T06:01:00Z"), TZ);
  expect([before, after]).toEqual(["2026-09-01", "2026-09-02"]);
  expect([shown(undefined, before), shown(undefined, after)]).toEqual([before, after]);
});

test("a picked day stays put across midnight; picking today follows it again", () => {
  const picked = pick("2026-08-30", "2026-09-01");
  expect(shown(picked, "2026-09-02")).toBe("2026-08-30");
  expect(pick("2026-09-02", "2026-09-02")).toBeUndefined();
  expect(pick("2026-09", "2026-09")).toBeUndefined();
});
