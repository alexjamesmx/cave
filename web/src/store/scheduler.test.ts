import { describe, expect, test } from "bun:test";
import { type SchedulerTimers, startSyncScheduler } from "./scheduler.ts";

function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { at: number; fn: () => void; every?: number }>();
  const timers: SchedulerTimers = {
    setTimeout: (fn, ms) => {
      const id = nextId++;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (id) => {
      pending.delete(id as number);
    },
    setInterval: (fn, ms) => {
      const id = nextId++;
      pending.set(id, { at: now + ms, fn, every: ms });
      return id;
    },
    clearInterval: (id) => {
      pending.delete(id as number);
    },
  };
  return {
    timers,
    active: () => pending.size,
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...pending.entries()]
          .filter(([, t]) => t.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, t] = due;
        now = t.at;
        if (t.every) t.at += t.every;
        else pending.delete(id);
        t.fn();
      }
      now = end;
    },
  };
}

function fakeDocument() {
  const target = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
  target.visibilityState = "visible";
  return target;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(sync: () => Promise<unknown> = async () => {}) {
  const clock = fakeTimers();
  const win = new EventTarget();
  const doc = fakeDocument();
  const errors: unknown[] = [];
  let calls = 0;
  const scheduler = startSyncScheduler({
    sync: () => {
      calls++;
      return sync();
    },
    window: win,
    document: doc,
    timers: clock.timers,
    onError: (e) => errors.push(e),
  });
  return { clock, win, doc, errors, scheduler, calls: () => calls };
}

describe("startSyncScheduler", () => {
  test("syncs on start", async () => {
    const s = setup();
    await s.scheduler.idle();
    expect(s.calls()).toBe(1);
  });

  test("debounces local writes to one sync 1 s after the last write", async () => {
    const s = setup();
    await s.scheduler.idle();
    s.scheduler.notifyWrite();
    s.clock.advance(600);
    s.scheduler.notifyWrite();
    s.clock.advance(999);
    await s.scheduler.idle();
    expect(s.calls()).toBe(1);
    s.clock.advance(1);
    await s.scheduler.idle();
    expect(s.calls()).toBe(2);
  });

  test("syncs on the online event and when the tab becomes visible", async () => {
    const s = setup();
    await s.scheduler.idle();
    s.win.dispatchEvent(new Event("online"));
    await s.scheduler.idle();
    expect(s.calls()).toBe(2);

    s.doc.visibilityState = "hidden";
    s.doc.dispatchEvent(new Event("visibilitychange"));
    await s.scheduler.idle();
    expect(s.calls()).toBe(2);

    s.doc.visibilityState = "visible";
    s.doc.dispatchEvent(new Event("visibilitychange"));
    await s.scheduler.idle();
    expect(s.calls()).toBe(3);
  });

  test("syncs every 60 s", async () => {
    const s = setup();
    await s.scheduler.idle();
    s.clock.advance(60_000);
    await s.scheduler.idle();
    s.clock.advance(60_000);
    await s.scheduler.idle();
    expect(s.calls()).toBe(3);
  });

  test("triggers during a running sync coalesce into one follow-up run", async () => {
    let release!: () => void;
    let blocked = true;
    const s = setup(() =>
      blocked
        ? new Promise<void>((r) => {
            release = r;
          })
        : Promise.resolve(),
    );
    await flush();
    s.win.dispatchEvent(new Event("online"));
    s.win.dispatchEvent(new Event("online"));
    s.clock.advance(60_000);
    expect(s.calls()).toBe(1);

    blocked = false;
    release();
    await s.scheduler.idle();
    expect(s.calls()).toBe(2);
  });

  test("a failed sync is reported and later triggers still run", async () => {
    let fail = true;
    const s = setup(async () => {
      if (fail) throw new TypeError("Failed to fetch");
    });
    await s.scheduler.idle();
    expect(s.errors).toHaveLength(1);

    fail = false;
    s.win.dispatchEvent(new Event("online"));
    await s.scheduler.idle();
    expect(s.calls()).toBe(2);
    expect(s.errors).toHaveLength(1);
  });

  test("stop() removes listeners and timers", async () => {
    const s = setup();
    await s.scheduler.idle();
    s.scheduler.notifyWrite();
    s.scheduler.stop();
    expect(s.clock.active()).toBe(0);
    s.win.dispatchEvent(new Event("online"));
    s.doc.dispatchEvent(new Event("visibilitychange"));
    s.clock.advance(120_000);
    await s.scheduler.idle();
    expect(s.calls()).toBe(1);
  });
});
