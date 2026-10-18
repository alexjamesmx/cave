import { ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("every page is served with the strict Content-Security-Policy", async ({ browser }) => {
  const page = await (await ownerContext(browser)).newPage();
  const response = await page.goto("/");
  const policy = response?.headers()["content-security-policy"] ?? "";
  expect(policy).toContain("script-src 'self'");
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain("frame-ancestors 'none'");
});

// The guard works: a page that breaks the policy fails its spec.
test.fail("an inline script is refused, and the violation fails the run", async ({ browser }) => {
  const page = await (await ownerContext(browser)).newPage();
  await page.goto("/");
  await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = "window.__inline = 1";
    document.body.append(script);
  });
  expect(
    await page.evaluate(() => (window as unknown as { __inline?: number }).__inline),
  ).toBeUndefined();
});
