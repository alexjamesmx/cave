import type { Stamp } from "./types.ts";

const MAX_COUNTER = 9999;
const STAMP_RE = /^(\d{13}):(\d{4}):([A-Za-z0-9_-]{1,64})$/;

export const SEED_STAMP: Stamp = "0000000000000:0000:seed";

export interface ClockState {
  ms: number;
  counter: number;
}

export function formatStamp(ms: number, counter: number, deviceId: string): Stamp {
  return `${String(ms).padStart(13, "0")}:${String(counter).padStart(4, "0")}:${deviceId}`;
}

export function isStamp(value: unknown): value is Stamp {
  return typeof value === "string" && STAMP_RE.test(value);
}

export function parseStamp(stamp: Stamp): ClockState & { deviceId: string } {
  const m = STAMP_RE.exec(stamp);
  if (!m) throw new Error(`invalid stamp: ${stamp}`);
  return { ms: Number(m[1]), counter: Number(m[2]), deviceId: m[3] as string };
}

/**
 * Hybrid logical clock. Wall time keeps stamps readable; the counter and `observe`
 * keep them ordered after anything this device has seen, even with a skewed clock.
 */
export class Hlc {
  #ms: number;
  #counter: number;

  constructor(
    private readonly deviceId: string,
    private readonly now: () => number,
    state: ClockState = { ms: 0, counter: 0 },
  ) {
    this.#ms = state.ms;
    this.#counter = state.counter;
  }

  get state(): ClockState {
    return { ms: this.#ms, counter: this.#counter };
  }

  next(): Stamp {
    const wall = this.now();
    if (wall > this.#ms) this.#set(wall, 0);
    else this.#set(this.#ms, this.#counter + 1);
    return formatStamp(this.#ms, this.#counter, this.deviceId);
  }

  observe(stamp: Stamp): void {
    this.adopt(parseStamp(stamp));
  }

  /** Moves to `state` if it is later, e.g. the clock another tab saved. */
  adopt(state: ClockState): void {
    if (state.ms > this.#ms || (state.ms === this.#ms && state.counter > this.#counter)) {
      this.#set(state.ms, state.counter);
    }
  }

  /** Sets the clock even if that moves it back: loading the shared clock, or clock recovery. */
  reset(state: ClockState): void {
    this.#ms = state.ms;
    this.#counter = state.counter;
  }

  // The stamp format has four counter digits; carrying into ms keeps string order intact.
  #set(ms: number, counter: number): void {
    if (counter > MAX_COUNTER) {
      this.#ms = ms + 1;
      this.#counter = 0;
    } else {
      this.#ms = ms;
      this.#counter = counter;
    }
  }
}
