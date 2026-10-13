import { describe, expect, test } from "bun:test";
import { resolveConfig } from "./config.ts";

describe("resolveConfig", () => {
  test("defaults to loopback, port 3000, no token", () => {
    expect(resolveConfig({})).toEqual({
      ok: true,
      value: { hostname: "127.0.0.1", port: 3000, token: undefined, dbPath: "data/cave.db" },
    });
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
      value: { hostname: "0.0.0.0", port: 8080, token: "t", dbPath: "data/cave.db" },
    });
  });

  test("rejects a bad port", () => {
    for (const PORT of ["abc", "0", "70000", "80.5"])
      expect(resolveConfig({ PORT }).ok).toBe(false);
  });

  test("reads the database path", () => {
    const result = resolveConfig({ CAVE_DB_PATH: "/srv/cave.db" });
    expect(result.ok && result.value.dbPath).toBe("/srv/cave.db");
  });
});
