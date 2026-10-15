import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";

// A local stand-in for a push service: it records what the Cave server sends it.
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

test("a reminder due in a minute reaches the device's push endpoint, encrypted and signed", async ({
  browser,
}) => {
  // The sweep runs every 30 seconds, so delivery can take up to a minute and a half.
  test.setTimeout(150_000);
  const service = await pushService();
  try {
    const context = await browser.newContext({ permissions: ["notifications"] });
    const page = await context.newPage();
    await page.goto("/settings");
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
        headers: { "content-type": "application/json" },
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
    const bar = page.getByLabel("Capture or jump");
    await bar.fill("remind push check in 1 min");
    await bar.press("Enter");
    await expect(
      page.getByRole("status").filter({ hasText: "Saved · Reminder · Push check" }),
    ).toBeVisible();

    await expect
      .poll(() => service.received.length, { timeout: 120_000, intervals: [2_000] })
      .toBe(1);
    const [request] = service.received;
    expect(request?.headers.authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
    expect(request?.headers["content-encoding"]).toBe("aes128gcm");
    expect(request?.headers.ttl).toBe("21600");
    expect(request?.bytes).toBeGreaterThan(86);
    // One reminder, one notification: the next sweeps send nothing more.
    await page.waitForTimeout(35_000);
    expect(service.received).toHaveLength(1);
  } finally {
    service.close();
  }
});
