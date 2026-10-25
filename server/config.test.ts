import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import webpush from "web-push";
import { resolveConfig } from "./config.ts";

describe("resolveConfig", () => {
  test("defaults to loopback, port 3000, no token", () => {
    expect(resolveConfig({})).toEqual({
      ok: true,
      value: {
        env: "dev",
        hostname: "127.0.0.1",
        port: 3000,
        token: undefined,
        dbPath: "data/cave.db",
        publicOrigin: undefined,
        backupDir: join("data", "backups"),
        allowedHosts: ["localhost", "127.0.0.1", "[::1]"],
        deployStatusPath: undefined,
        offsiteStatusPath: undefined,
        push: undefined,
        telegramToken: undefined,
        discordWebhook: undefined,
        email: undefined,
      },
    });
  });

  test("CAVE_ENV is production, dev or test; unset is dev; anything else refuses to start", () => {
    for (const env of ["production", "dev", "test"] as const) {
      const result = resolveConfig({ CAVE_ENV: env });
      expect(result.ok && result.value.env).toBe(env);
    }
    expect(resolveConfig({ CAVE_ENV: "" }).ok && resolveConfig({}).ok).toBe(true);
    for (const bad of ["prod", "Production", "development", " production"]) {
      const result = resolveConfig({ CAVE_ENV: bad });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("CAVE_ENV must be production, dev or test");
    }
  });

  test("loopback hosts need no token", () => {
    for (const host of ["localhost", "127.0.0.1", "127.8.9.10", "::1"]) {
      expect(resolveConfig({ CAVE_HOST: host }).ok).toBe(true);
    }
  });

  test("refuses a non-loopback host without a token", () => {
    for (const env of [
      { CAVE_HOST: "0.0.0.0" },
      { CAVE_HOST: "192.168.1.20", CAVE_TOKEN: "" },
      { CAVE_HOST: "::" },
      { CAVE_HOST: "0.0.0.0", JARVIS_TOKEN: "old-name" },
    ]) {
      const result = resolveConfig(env);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("CAVE_TOKEN");
    }
  });

  test("accepts a non-loopback host with a token", () => {
    const result = resolveConfig({ CAVE_HOST: "0.0.0.0", CAVE_TOKEN: "t", PORT: "8080" });
    expect(result).toEqual({
      ok: true,
      value: {
        env: "dev",
        hostname: "0.0.0.0",
        port: 8080,
        token: "t",
        dbPath: "data/cave.db",
        publicOrigin: undefined,
        backupDir: join("data", "backups"),
        allowedHosts: ["localhost", "127.0.0.1", "[::1]"],
        deployStatusPath: undefined,
        offsiteStatusPath: undefined,
        push: undefined,
        telegramToken: undefined,
        discordWebhook: undefined,
        email: undefined,
      },
    });
  });

  test("rejects a bad port", () => {
    for (const PORT of ["abc", "0", "70000", "80.5"])
      expect(resolveConfig({ PORT }).ok).toBe(false);
  });

  test("/mcp answers to loopback, a named CAVE_HOST and CAVE_ALLOWED_HOSTS", () => {
    const named = resolveConfig({ CAVE_HOST: "laptop.tail1234.ts.net", CAVE_TOKEN: "t" });
    expect(named.ok && named.value.allowedHosts).toEqual([
      "localhost",
      "127.0.0.1",
      "[::1]",
      "laptop.tail1234.ts.net",
    ]);
    const wildcard = resolveConfig({
      CAVE_HOST: "0.0.0.0",
      CAVE_TOKEN: "t",
      CAVE_ALLOWED_HOSTS: " 100.64.0.7, Laptop.local ,",
    });
    expect(wildcard.ok && wildcard.value.allowedHosts).toEqual([
      "localhost",
      "127.0.0.1",
      "[::1]",
      "100.64.0.7",
      "laptop.local",
    ]);
  });

  test("reads the database path", () => {
    const result = resolveConfig({ CAVE_DB_PATH: "/srv/cave.db" });
    expect(result.ok && result.value.dbPath).toBe("/srv/cave.db");
  });

  test("backups go next to the database unless BACKUP_DIR is set", () => {
    const at = (env: Record<string, string>) => {
      const result = resolveConfig(env);
      return result.ok ? result.value.backupDir : undefined;
    };
    expect(at({ CAVE_DB_PATH: "/srv/cave.db" })).toBe(join("/srv", "backups"));
    expect(at({ BACKUP_DIR: "D:/OneDrive/cave" })).toBe("D:/OneDrive/cave");
  });

  describe("CAVE_PUBLIC_ORIGIN", () => {
    const LONG = "x".repeat(32);
    const ORIGIN = "https://cave.example.dev";

    test("its host joins the allowed hosts", () => {
      const result = resolveConfig({ CAVE_PUBLIC_ORIGIN: ORIGIN, CAVE_TOKEN: LONG });
      expect(result.ok && result.value.publicOrigin).toBe(ORIGIN);
      expect(result.ok && result.value.allowedHosts).toContain("cave.example.dev");
    });

    test("is refused without a token, since every request arrives from the proxy on loopback", () => {
      const result = resolveConfig({ CAVE_PUBLIC_ORIGIN: ORIGIN });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("CAVE_TOKEN");
    });

    test("must be a bare https origin", () => {
      for (const value of [
        "http://cave.example.dev",
        "https://cave.example.dev/app",
        "https://cave.example.dev?x=1",
        "cave.example.dev",
        "https://user@cave.example.dev",
      ]) {
        expect(resolveConfig({ CAVE_PUBLIC_ORIGIN: value, CAVE_TOKEN: LONG }).ok).toBe(false);
      }
      const trailing = resolveConfig({ CAVE_PUBLIC_ORIGIN: `${ORIGIN}/`, CAVE_TOKEN: LONG });
      expect(trailing.ok && trailing.value.publicOrigin).toBe(ORIGIN);
    });

    test("in production a public server needs a token of at least 32 characters", () => {
      const short = { CAVE_PUBLIC_ORIGIN: ORIGIN, CAVE_TOKEN: "x".repeat(31) };
      expect(resolveConfig(short, { production: true }).ok).toBe(false);
      expect(resolveConfig(short).ok).toBe(true);
      expect(resolveConfig({ ...short, CAVE_TOKEN: LONG }, { production: true }).ok).toBe(true);
      // A loopback server with no public origin keeps working without a token.
      expect(resolveConfig({}, { production: true }).ok).toBe(true);
    });
  });
});

describe("notification settings", () => {
  const keys = webpush.generateVAPIDKeys();
  const vapid = {
    CAVE_VAPID_PUBLIC: keys.publicKey,
    CAVE_VAPID_PRIVATE: keys.privateKey,
    CAVE_VAPID_SUBJECT: "mailto:owner@example.com",
  };

  test("no VAPID settings means push is off; all three turn it on", () => {
    const off = resolveConfig({});
    expect(off.ok && off.value.push).toBeUndefined();
    const on = resolveConfig(vapid);
    expect(on.ok && on.value.push).toEqual({
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      subject: "mailto:owner@example.com",
    });
  });

  test("some VAPID settings refuse to start, naming the missing ones but never a value", () => {
    const partial = resolveConfig({ CAVE_VAPID_PUBLIC: keys.publicKey });
    expect(partial).toEqual({
      ok: false,
      error:
        "Web Push needs all three VAPID settings; missing: CAVE_VAPID_PRIVATE, CAVE_VAPID_SUBJECT",
    });
    for (const bad of [
      { ...vapid, CAVE_VAPID_PUBLIC: "short" },
      { ...vapid, CAVE_VAPID_PRIVATE: keys.publicKey },
      { ...vapid, CAVE_VAPID_SUBJECT: "owner@example.com" },
    ]) {
      const result = resolveConfig(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).not.toContain(keys.privateKey);
    }
  });

  test("a Telegram token and a Discord webhook are checked for shape, never echoed", () => {
    const token = `123456789:${"A".repeat(35)}`;
    const ok = resolveConfig({
      CAVE_TELEGRAM_BOT_TOKEN: token,
      CAVE_DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/123/abc-DEF_9",
    });
    expect(ok.ok && [ok.value.telegramToken, ok.value.discordWebhook]).toEqual([
      token,
      "https://discord.com/api/webhooks/123/abc-DEF_9",
    ]);
    const badToken = resolveConfig({ CAVE_TELEGRAM_BOT_TOKEN: "secret-value" });
    expect(!badToken.ok && badToken.error).not.toContain("secret-value");
    for (const url of [
      "http://discord.com/api/webhooks/123/abc",
      "https://evil.example/api/webhooks/123/abc",
      "https://discord.com/api/other/123/abc",
    ]) {
      const result = resolveConfig({ CAVE_DISCORD_WEBHOOK_URL: url });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).not.toContain(url);
    }
    expect(
      resolveConfig({ CAVE_DISCORD_WEBHOOK_URL: "https://discordapp.com/api/webhooks/1/x" }).ok,
    ).toBe(true);
  });
});
