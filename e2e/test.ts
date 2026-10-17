import { test as base, expect } from "@playwright/test";

export * from "@playwright/test";

/** Every CSP violation a page reports, as its console states it. */
export const violations: string[] = [];

/**
 * The specs' `test`: after each one, any Content-Security-Policy violation a page reported
 * fails it. Contexts made by `ownerContext` report into `violations`.
 */
export const test = base.extend<{ cspGuard: undefined }>({
  cspGuard: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's dependencies from this pattern
    async ({}, use) => {
      const start = violations.length;
      await use(undefined);
      expect(violations.slice(start), "Content-Security-Policy violations").toEqual([]);
    },
    { auto: true },
  ],
});
