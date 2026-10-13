import { expect, test } from "bun:test";
import { formatStamp } from "../shared/hlc.ts";
import { openDb } from "./db.ts";
import { createHistoryHandler } from "./history.ts";
import { type Change, createStore } from "./store.ts";

const store = createStore(openDb(":memory:"));
const edit = (status: string, ms: number) =>
  store.applyChanges(
    [
      {
        id: "t1",
        kind: "item",
        collection: "tasks",
        data: { status },
        stamps: { status: formatStamp(ms, 0, "dev-a") },
        actor: "",
      },
    ],
    "user:dev-a",
    ms,
  );
edit("todo", 1);
edit("done", 2);

const get = (id: string, token: string | undefined, auth?: string) =>
  createHistoryHandler({ store, token })(
    Object.assign(
      new Request(`http://cave.test/api/history/${id}`, {
        headers: auth ? { authorization: auth } : {},
      }),
      { params: { id } },
    ),
  );

test("returns one doc's changes, newest first, with previous values", async () => {
  const res = get("t1", undefined);
  expect(res.status).toBe(200);
  const { changes } = (await res.json()) as { changes: Change[] };
  expect(changes.map((c) => c.at)).toEqual([2, 1]);
  expect(changes[0]?.before).toEqual({
    status: { value: "todo", stamp: formatStamp(1, 0, "dev-a") },
  });
});

test("needs the token when one is set and rejects bad ids", () => {
  expect(get("t1", "s3cret").status).toBe(401);
  expect(get("t1", "s3cret", "Bearer s3cret").status).toBe(200);
  expect(get("Bad Id", undefined).status).toBe(400);
});
