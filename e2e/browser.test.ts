import { describe, expect, test } from "bun:test";
import {
  browserUse,
  CLOUD_CHROMIUM,
  chooseBrowser,
  LINUX_CHROME,
  snapshotPathTemplate,
} from "./browser.ts";

const none = () => false;
const cloud = (path: string) => path === CLOUD_CHROMIUM;

describe("chooseBrowser", () => {
  test("an explicit executable wins over everything", () => {
    expect(
      chooseBrowser({ CAVE_E2E_EXECUTABLE: "/x/chrome", CAVE_E2E_CHANNEL: "chrome" }, "linux"),
    ).toEqual({ executablePath: "/x/chrome" });
  });

  test("an explicit channel wins over the platform default", () => {
    expect(chooseBrowser({ CAVE_E2E_CHANNEL: "chrome" }, "linux", cloud)).toEqual({
      channel: "chrome",
    });
  });

  test("Linux uses the cloud VM's Chromium when it is there", () => {
    expect(chooseBrowser({}, "linux", cloud)).toEqual({ executablePath: CLOUD_CHROMIUM });
  });

  test("Linux without it uses the installed Google Chrome", () => {
    const chrome = (path: string) => path === LINUX_CHROME;
    expect(chooseBrowser({}, "linux", chrome)).toEqual({ channel: "chrome" });
    const both = (path: string) => cloud(path) || chrome(path);
    expect(chooseBrowser({}, "linux", both)).toEqual({ executablePath: CLOUD_CHROMIUM });
  });

  test("otherwise it fails naming both variables", () => {
    expect(() => chooseBrowser({}, "linux", none)).toThrow(
      "set CAVE_E2E_EXECUTABLE or CAVE_E2E_CHANNEL",
    );
    expect(() => chooseBrowser({}, "darwin", cloud)).toThrow("CAVE_E2E_EXECUTABLE");
  });

  test("empty variables count as unset", () => {
    expect(
      chooseBrowser({ CAVE_E2E_EXECUTABLE: "", CAVE_E2E_CHANNEL: "" }, "linux", cloud),
    ).toEqual({ executablePath: CLOUD_CHROMIUM });
  });
});

describe("snapshotPathTemplate", () => {
  test("Google Chrome gets its own baselines; the cloud Chromium keeps the platform's", () => {
    expect(snapshotPathTemplate({ channel: "chrome" })).toBe(
      "{testDir}/{testFileName}-snapshots/{arg}-{platform}-chrome{ext}",
    );
    expect(snapshotPathTemplate({ executablePath: CLOUD_CHROMIUM })).toBe(
      "{testDir}/{testFileName}-snapshots/{arg}-{platform}{ext}",
    );
  });
});

describe("browserUse", () => {
  test("a binary goes to launchOptions, a channel to channel", () => {
    expect(browserUse({ executablePath: "/x" })).toEqual({
      launchOptions: { executablePath: "/x" },
    });
    expect(browserUse({ channel: "chrome" })).toEqual({ channel: "chrome" });
  });
});
