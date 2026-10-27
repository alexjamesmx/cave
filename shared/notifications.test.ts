import { expect, test } from "bun:test";
import {
  DEFAULT_NOTIFICATIONS,
  isSenderName,
  notificationSettings,
  parseRecipients,
} from "./notifications.ts";

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
  // The digest's time lives in its flow now; an old value here is ignored.
  expect(
    notificationSettings({ notifications: { channels: ["email"], digest: "07:30" } }),
  ).not.toHaveProperty("digest");
});

test("recipients and sender names are checked before anything is kept", () => {
  expect(parseRecipients(" a@x.com , b@y.org ")).toEqual(["a@x.com", "b@y.org"]);
  expect(parseRecipients("")).toBeUndefined();
  expect(parseRecipients("a@x.com, nope")).toBeUndefined();
  expect(isSenderName("Alex's Cave")).toBe(true);
  expect(isSenderName("x\nBcc: y@z.com")).toBe(false);
  const s = notificationSettings({ notifications: { emailTo: "me@x.com", emailFromName: "Me" } });
  expect([s.emailTo, s.emailFromName]).toEqual(["me@x.com", "Me"]);
  const bad = notificationSettings({ notifications: { emailTo: "nope", emailFromName: "<x>" } });
  expect([bad.emailTo, bad.emailFromName]).toEqual([undefined, undefined]);
});
