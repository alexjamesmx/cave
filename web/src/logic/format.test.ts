import { expect, test } from "bun:test";
import { formatMoney, percent, signedMoney } from "./format.ts";

test("whole amounts have no decimals; any cents show two digits", () => {
  expect(formatMoney(16842)).toBe("$16,842");
  expect(formatMoney(16854.5)).toBe("$16,854.50");
  expect(formatMoney(0.1 + 0.2)).toBe("$0.30");
  expect(formatMoney(-6024)).toBe("$6,024");
  expect(formatMoney(3 + 1e-12)).toBe("$3");
});

test("signs and shares", () => {
  expect(signedMoney(205, "expense")).toBe("−$205");
  expect(signedMoney(15040, "income")).toBe("+$15,040");
  expect(percent(1, 3)).toBe("33%");
  expect(percent(1, 0)).toBe("0%");
});
