import { expect, test } from "@playwright/test";
import { offOriginRequests, syncBadge } from "./helpers.ts";

test("a value the server refuses shows as not synced, with the reason", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext();
  const foreign = offOriginRequests(context, baseURL as string);
  const page = await context.newPage();
  await page.goto("/");
  await expect(syncBadge(page)).toHaveText("SYNCED");

  // The app itself refuses such a value, so it goes straight into IndexedDB, as an older
  // client or another tab could have left it.
  await page.evaluate(async () => {
    const deviceId = localStorage.getItem("cave.deviceId") as string;
    const stamp = `${String(Date.now()).padStart(13, "0")}:0000:${deviceId}`;
    const data = { _title: "Bad amount", amount: "12abc", direction: "expense" };
    const doc = {
      id: "e2e-bad-amount",
      kind: "item",
      collection: "money",
      data,
      stamps: Object.fromEntries(Object.keys(data).map((key) => [key, stamp])),
      actor: `user:${deviceId}`,
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("cave");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["docs", "outbox"], "readwrite");
      tx.objectStore("docs").put(doc);
      tx.objectStore("outbox").put({ id: doc.id, rev: 1 });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    window.dispatchEvent(new Event("online"));
  });

  await expect(syncBadge(page)).toHaveText("1 NOT SYNCED");
  await page.goto("/c/money/table");
  await page.getByRole("button", { name: "Bad amount" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Not synced: the server refused field amount: must be a finite number",
  );

  expect(foreign).toEqual([]);
  await context.close();
});
