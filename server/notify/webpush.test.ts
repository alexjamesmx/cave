import { describe, expect, test } from "bun:test";
import webpush from "web-push";
import { openDb } from "../db.ts";
import type { Message } from "./types.ts";
import {
  createSubscriptions,
  createWebPushChannel,
  payload,
  retryAfterMs,
  validateSubscription,
} from "./webpush.ts";

// RFC 8291 (Message Encryption for Web Push) written out with Web Crypto, independent of the
// library: it checks the library against the standard rather than against itself.
const subtle = crypto.subtle;
const b64u = (s: string) => new Uint8Array(Buffer.from(s.replace(/\s+/g, ""), "base64url"));
const text = (s: string) => new TextEncoder().encode(s);
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const zero = new Uint8Array([0]);

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(
    await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8),
  );
}
const privateKey = (d: Uint8Array, publicRaw: Uint8Array) =>
  subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: Buffer.from(d).toString("base64url"),
      x: Buffer.from(publicRaw.slice(1, 33)).toString("base64url"),
      y: Buffer.from(publicRaw.slice(33, 65)).toString("base64url"),
    },
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
const publicKey = (raw: Uint8Array) =>
  subtle.importKey("raw", raw, { name: "ECDH", namedCurve: "P-256" }, false, []);

async function keys(
  ecdh: Uint8Array,
  auth: Uint8Array,
  uaPublic: Uint8Array,
  asPublic: Uint8Array,
  salt: Uint8Array,
) {
  const ikm = await hkdf(auth, ecdh, concat(text("WebPush: info"), zero, uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, concat(text("Content-Encoding: aes128gcm"), zero), 16);
  const nonce = await hkdf(salt, ikm, concat(text("Content-Encoding: nonce"), zero), 12);
  return {
    cek: await subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt", "decrypt"]),
    nonce,
  };
}

async function encrypt(
  plain: Uint8Array,
  uaPublic: Uint8Array,
  auth: Uint8Array,
  asPrivate: Uint8Array,
  asPublic: Uint8Array,
  salt: Uint8Array,
) {
  const ecdh = new Uint8Array(
    await subtle.deriveBits(
      { name: "ECDH", public: await publicKey(uaPublic) },
      await privateKey(asPrivate, asPublic),
      256,
    ),
  );
  const { cek, nonce } = await keys(ecdh, auth, uaPublic, asPublic, salt);
  const sealed = new Uint8Array(
    await subtle.encrypt({ name: "AES-GCM", iv: nonce }, cek, concat(plain, new Uint8Array([2]))),
  );
  const rs = new Uint8Array([0, 0, 0x10, 0]);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, sealed);
}

async function decrypt(
  body: Uint8Array,
  uaPrivate: Uint8Array,
  uaPublic: Uint8Array,
  auth: Uint8Array,
) {
  const salt = body.slice(0, 16);
  const idLength = body[20] as number;
  const asPublic = body.slice(21, 21 + idLength);
  const ecdh = new Uint8Array(
    await subtle.deriveBits(
      { name: "ECDH", public: await publicKey(asPublic) },
      await privateKey(uaPrivate, uaPublic),
      256,
    ),
  );
  const { cek, nonce } = await keys(ecdh, auth, uaPublic, asPublic, salt);
  const padded = new Uint8Array(
    await subtle.decrypt({ name: "AES-GCM", iv: nonce }, cek, body.slice(21 + idLength)),
  );
  const end = padded.lastIndexOf(2);
  return new TextDecoder().decode(padded.slice(0, end));
}

// RFC 8291 Appendix A.
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPublic: b64u(
    "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIg Dll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  ),
  asPrivate: b64u("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"),
  uaPublic: b64u(
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcx aOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  ),
  uaPrivate: b64u("q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94"),
  salt: b64u("DGv6ra1nlYgDCS1FRnbzlw"),
  auth: b64u("BTBZMqHH6r4Tts7J_aSIgg"),
  header: b64u(
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z 9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml mlMoZIIgDll6e3vCYLocInmYWAmS6Tlz AC8wEqKK6PBru3jl7A8",
  ),
  ciphertext: b64u(
    "8pfeW0KbunFT06SuDKoJH9Ql87S1QUrd irN6GcG7sFz1y1sqLgVi1VhjVkHsUoEs bI_0LpXMuGvnzQ",
  ),
};

describe("RFC 8291 aes128gcm", () => {
  test("Appendix A's inputs encrypt to its output, byte for byte", async () => {
    const out = await encrypt(
      text(RFC.plaintext),
      RFC.uaPublic,
      RFC.auth,
      RFC.asPrivate,
      RFC.asPublic,
      RFC.salt,
    );
    expect(Buffer.from(out).toString("base64url")).toBe(
      Buffer.from(concat(RFC.header, RFC.ciphertext)).toString("base64url"),
    );
    expect(await decrypt(out, RFC.uaPrivate, RFC.uaPublic, RFC.auth)).toBe(RFC.plaintext);
  });

  test("web-push 3.6.7 output decrypts with the RFC's algorithm, and carries a VAPID header", async () => {
    const ua = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ]);
    const uaPublic = new Uint8Array(await subtle.exportKey("raw", ua.publicKey));
    const jwk = await subtle.exportKey("jwk", ua.privateKey);
    const uaPrivate = b64u(jwk.d as string);
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const vapid = webpush.generateVAPIDKeys();
    const request = webpush.generateRequestDetails(
      {
        endpoint: "https://push.example.test/sub",
        keys: {
          p256dh: Buffer.from(uaPublic).toString("base64url"),
          auth: Buffer.from(auth).toString("base64url"),
        },
      },
      '{"web_push":8030}',
      { vapidDetails: { subject: "mailto:o@example.com", ...vapid }, contentEncoding: "aes128gcm" },
    );
    expect(request.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(String(request.headers.Authorization)).toMatch(/^vapid t=.+, k=/);
    expect(await decrypt(new Uint8Array(request.body as Buffer), uaPrivate, uaPublic, auth)).toBe(
      '{"web_push":8030}',
    );
  });
});

describe("subscriptions", () => {
  const p256dh = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString("base64url");
  const auth = Buffer.alloc(16, 1).toString("base64url");
  const sub = (endpoint: string, keys: Record<string, string> = { p256dh, auth }) => ({
    endpoint,
    keys,
  });
  const strict = { allowLoopbackHttp: false };

  test("a browser subscription is accepted with an https endpoint and keys of the right length", () => {
    expect(validateSubscription(sub("https://fcm.googleapis.com/fcm/send/abc"), strict)).toEqual({
      ok: true,
      value: { endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh, auth },
    });
  });

  test("anything else is refused", () => {
    for (const bad of [
      null,
      { keys: { p256dh, auth } },
      sub("http://push.example.test/abc"),
      sub("http://127.0.0.1:9/abc"),
      sub("javascript:alert(1)"),
      sub(`https://x.test/${"a".repeat(2100)}`),
      sub("https://x.test/a", {
        p256dh: Buffer.alloc(65, 4).toString("base64url").replace(/^./, "A"),
        auth,
      }),
      sub("https://x.test/a", { p256dh: "not base64!", auth }),
      sub("https://x.test/a", { p256dh, auth: Buffer.alloc(8).toString("base64url") }),
    ]) {
      expect(validateSubscription(bad, strict).ok).toBe(false);
    }
  });

  test("loopback http only on a non-production server, for the e2e test's push endpoint", () => {
    expect(
      validateSubscription(sub("http://127.0.0.1:9/abc"), { allowLoopbackHttp: true }).ok,
    ).toBe(true);
    expect(validateSubscription(sub("http://10.0.0.1/abc"), { allowLoopbackHttp: true }).ok).toBe(
      false,
    );
  });
});

describe("the Web Push channel", () => {
  const message: Message = {
    kind: "reminder",
    itemId: "r1",
    title: "Pay rent",
    body: "Thu Oct 22, 09:00",
    url: "https://cave.example.dev/r/r1",
    tag: "reminder:r1",
    actions: [{ id: "done", label: "Done", url: "https://cave.example.dev/r/r1?do=done" }],
  };

  test("the payload is Declarative Web Push, which other browsers' service workers show", () => {
    expect(JSON.parse(payload(message))).toEqual({
      web_push: 8030,
      notification: {
        title: "Pay rent",
        body: "Thu Oct 22, 09:00",
        navigate: "https://cave.example.dev/r/r1",
        tag: "reminder:r1",
        lang: "en",
        dir: "ltr",
        silent: false,
        actions: [
          { action: "done", title: "Done", navigate: "https://cave.example.dev/r/r1?do=done" },
        ],
      },
    });
  });

  test("Retry-After is read as seconds or a date and capped at 5 minutes", () => {
    expect(retryAfterMs("2", 0)).toBe(2000);
    expect(retryAfterMs(null, 0)).toBe(0);
    expect(retryAfterMs("100000", 0)).toBe(300_000);
    expect(retryAfterMs(new Date(30_000).toUTCString(), 0)).toBe(30_000);
  });

  async function setup(answers: number[][]) {
    const db = openDb(":memory:");
    const subscriptions = createSubscriptions(db);
    const ua = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ]);
    const p256dh = Buffer.from(await subtle.exportKey("raw", ua.publicKey)).toString("base64url");
    const auth = Buffer.alloc(16, 2).toString("base64url");
    answers.forEach((_, i) =>
      subscriptions.upsert(
        { endpoint: `https://push.example.test/${i}`, p256dh, auth },
        `device-${i}`,
        `Phone ${i}`,
        i,
      ),
    );
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const slept: number[] = [];
    const lines: string[] = [];
    const queues = answers.map((a) => [...a]);
    const channel = createWebPushChannel({
      keys: { subject: "mailto:o@example.com", ...webpush.generateVAPIDKeys() },
      subscriptions,
      now: () => 0,
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, headers: init.headers as Record<string, string> });
        const status = queues[Number(url.split("/").pop())]?.shift() ?? 500;
        return new Response(null, {
          status,
          headers: status === 429 ? { "retry-after": "2" } : {},
        });
      }) as unknown as typeof fetch,
      sleep: async (ms) => {
        slept.push(ms);
      },
      log: (l) => lines.push(l),
    });
    return { channel, subscriptions, calls, slept, lines };
  }

  test("delivers to each device, drops gone subscriptions and retries a busy service once", async () => {
    const { channel, subscriptions, calls, slept, lines } = await setup([
      [201],
      [410],
      [429, 201],
      [503, 503],
    ]);
    expect(channel.status()).toEqual({ ready: true, summary: "4 devices" });
    expect(await channel.send(message)).toEqual({ delivered: 2, failed: 2 });
    expect(calls).toHaveLength(6);
    expect(slept).toEqual([2000, 0]);
    expect(calls[0]?.headers.Authorization).toMatch(/^vapid t=/);
    expect(calls[0]?.headers["Content-Encoding"]).toBe("aes128gcm");
    const left = subscriptions.list();
    expect(left.map((s) => s.endpoint)).toEqual([
      "https://push.example.test/0",
      "https://push.example.test/2",
      "https://push.example.test/3",
    ]);
    expect(left.map((s) => [s.last_ok_at !== null, s.last_error])).toEqual([
      [true, null],
      [true, null],
      [false, "HTTP 503"],
    ]);
    for (const line of lines) {
      expect(line).not.toContain("push.example.test");
      expect(line).not.toContain("Pay rent");
    }
  });

  test("a test for one device goes to that device only", async () => {
    const { channel, calls } = await setup([[201], [201]]);
    expect(await channel.send(message, "device-1")).toEqual({ delivered: 1, failed: 0 });
    expect(calls.map((c) => c.url)).toEqual(["https://push.example.test/1"]);
  });

  test("without keys or devices it says what it needs", () => {
    const subscriptions = createSubscriptions(openDb(":memory:"));
    expect(createWebPushChannel({ keys: undefined, subscriptions, now: () => 0 }).status()).toEqual(
      {
        ready: false,
        summary: "needs keys",
      },
    );
    const keys = { subject: "mailto:o@example.com", ...webpush.generateVAPIDKeys() };
    expect(createWebPushChannel({ keys, subscriptions, now: () => 0 }).status()).toEqual({
      ready: false,
      summary: "no devices yet",
    });
  });
});
