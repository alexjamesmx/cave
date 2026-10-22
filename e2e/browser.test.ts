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
      chooseBrowser({ CAVE_E2E_EXECUTABLE: "/x/chrome", CAVE_E2E_CHANNEL: "msedge" }, "win32"),
    ).toEqual({ executablePath: "/x/chrome" });
  });

  test("an explicit channel wins over the platform default", () => {
    expect(chooseBrowser({ CAVE_E2E_CHANNEL: "chrome" }, "linux", cloud)).toEqual({
      channel: "chrome",
    });
  });

  test("Windows uses the installed Edge", () => {
    expect(chooseBrowser({}, "win32", none)).toEqual({ channel: "msedge" });
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
    expect(chooseBrowser({ CAVE_E2E_EXECUTABLE: "", CAVE_E2E_CHANNEL: "" }, "win32")).toEqual({
      channel: "msedge",
    });
  });
});

describe("snapshotPathTemplate", () => {
  test("Google Chrome gets its own baselines; Edge and Chromium keep the platform's", () => {
    expect(snapshotPathTemplate({ channel: "chrome" })).toBe(
      "{testDir}/{testFileName}-snapshots/{arg}-{platform}-chrome{ext}",
    );
    for (const choice of [{ channel: "msedge" }, { executablePath: CLOUD_CHROMIUM }])
      expect(snapshotPathTemplate(choice)).toBe(
        "{testDir}/{testFileName}-snapshots/{arg}-{platform}{ext}",
      );
  });
});

describe("browserUse", () => {
  test("a binary goes to launchOptions, a channel to channel", () => {
    expect(browserUse({ executablePath: "/x" })).toEqual({
      launchOptions: { executablePath: "/x" },
    });
    expect(browserUse({ channel: "msedge" })).toEqual({ channel: "msedge" });
  });
});
