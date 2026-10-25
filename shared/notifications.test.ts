import { expect, test } from "bun:test";
import { DEFAULT_NOTIFICATIONS, notificationSettings } from "./notifications.ts";

test("missing or malformed settings fall back to the private defaults", () => {
  expect(notificationSettings(undefined)).toEqual(DEFAULT_NOTIFICATIONS);
  expect(notificationSettings({ notifications: "yes" })).toEqual(DEFAULT_NOTIFICATIONS);
  expect(DEFAULT_NOTIFICATIONS.detail).toEqual({
    webpush: "full",
    telegram: "titles",
    discord: "titles",
    email: "full",
  });
});

test("the owner's choices are read, unknown channels and values are dropped", () => {
  expect(
    notificationSettings({
      notifications: {
        channels: ["telegram", "ntfy", "telegram", "webpush"],
        detail: { telegram: "full", discord: "everything" },
        telegramApprovals: true,
        digest: "25:00",
      },
    }),
  ).toEqual({
    channels: ["telegram", "webpush"],
    detail: { webpush: "full", telegram: "full", discord: "titles", email: "full" },
    telegramApprovals: true,
  });
  expect(
    notificationSettings({ notifications: { channels: ["email"], digest: "07:30" } }),
  ).toMatchObject({ channels: ["email"], digest: "07:30" });
});
