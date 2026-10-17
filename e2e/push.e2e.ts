import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { fillReminder, ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

// A local stand-in for a push service: under CAVE_ENV=test it must receive nothing.
function pushService() {
  const received: { headers: IncomingHttpHeaders; bytes: number }[] = [];
  const server = createServer((req, res) => {
    let bytes = 0;
    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
    });
    req.on("end", () => {
      received.push({ headers: req.headers, bytes });
      res.writeHead(201).end();
    });
  });
  return new Promise<{ url: string; received: typeof received; close(): void }>((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}/push/e2e`, received, close: () => server.close() });
    }),
  );
}

test("CAVE_ENV=test: a reminder due in a minute lands in the outbox and never reaches the push endpoint", async ({
  browser,
}) => {
  // The sweep runs every 30 seconds, so delivery can take up to a minute and a half.
  test.setTimeout(150_000);
  const service = await pushService();
  try {
    const context = await ownerContext(browser, { permissions: ["notifications"] });
    const page = await context.newPage();
    await page.goto("/settings/notifications");
    const section = page.getByText("Notifications on this device").locator("..");
    await expect(section.getByRole("button", { name: "Enable notifications" })).toBeVisible();

    // A headless browser has no push service to subscribe to, so the page posts a
    // subscription for the local one, with real P-256 keys the server can encrypt to.
    const status = await page.evaluate(async (endpoint) => {
      const keys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
        "deriveBits",
      ]);
      const raw = new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey));
      const b64u = (bytes: Uint8Array) =>
        btoa(String.fromCharCode(...bytes))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${localStorage.getItem("cave.token")}`,
        },
        body: JSON.stringify({
          subscription: {
            endpoint,
            keys: { p256dh: b64u(raw), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) },
          },
          deviceId: "e2e-device",
          label: "E2E · Browser",
        }),
      });
      return res.status;
    }, service.url);
    expect(status).toBe(200);
    await page.reload();
    await expect(page.getByText("E2E · Browser")).toBeVisible();

    await page.goto("/");
    const form = await fillReminder(page, "Push check", "in 1 min");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Saved · Reminder · Push check" }),
    ).toBeVisible();

    // The outbox row is written where a send would happen: same sweep, same key.
    const outbox = () =>
      page.evaluate(async () => {
        const res = await fetch("/api/system", {
          headers: { authorization: `Bearer ${localStorage.getItem("cave.token")}` },
        });
        const report = (await res.json()) as {
          env: string;
          notifications: { log: { channel: string; key: string; result: string }[] };
        };
        return { env: report.env, rows: report.notifications.log };
      });
    await expect
      .poll(
        async () =>
          (await outbox()).rows.filter(
            (r) =>
              r.channel === "webpush" && r.result === "outbox" && r.key.startsWith("reminder:"),
          ).length,
        { timeout: 120_000, intervals: [2_000] },
      )
      .toBe(1);
    expect((await outbox()).env).toBe("test");
    // One reminder, one outbox row, and nothing ever reached the push service.
    await page.waitForTimeout(35_000);
    expect(service.received).toHaveLength(0);

    await page.goto("/settings/system/notifications");
    await expect(page.getByText("TEST", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Dev outbox" })).toContainText("webpush");
  } finally {
    service.close();
  }
});
