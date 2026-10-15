import { expect, test } from "bun:test";
import { DEFAULT_NOTIFICATIONS, notificationSettings } from "./notifications.ts";

test("missing or malformed settings fall back to the private defaults", () => {
  expect(notificationSettings(undefined)).toEqual(DEFAULT_NOTIFICATIONS);
  expect(notificationSettings({ notifications: "yes" })).toEqual(DEFAULT_NOTIFICATIONS);
  expect(DEFAULT_NOTIFICATIONS.detail).toEqual({
    webpush: "full",
    telegram: "titles",
    discord: "titles",
  });
});

test("the owner's choices are read, unknown channels and values are dropped", () => {
  expect(
    notificationSettings({
      notifications: {
        channels: ["telegram", "email", "telegram", "webpush"],
        detail: { telegram: "full", discord: "everything" },
        telegramApprovals: true,
      },
    }),
  ).toEqual({
    channels: ["telegram", "webpush"],
    detail: { webpush: "full", telegram: "full", discord: "titles" },
    telegramApprovals: true,
  });
});
