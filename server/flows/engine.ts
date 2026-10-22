import type { Database } from "bun:sqlite";
import { localDate } from "../../shared/dates.ts";
import { fieldsOf } from "../../shared/fields.ts";
import { allHold, holds } from "../../shared/flows/conditions.ts";
import { type FlowDefinition, parseDefinition, type Step } from "../../shared/flows/registry.ts";
import { latestSlot } from "../../shared/flows/schedule.ts";
import { FLOWS } from "../../shared/flows/seed.ts";
import { renderTemplate, type TemplateContext } from "../../shared/flows/templates.ts";
import { parseStamp } from "../../shared/hlc.ts";
import type { Zone } from "../../shared/reminders.ts";
import type { Doc } from "../../shared/types.ts";
import { every, type Job } from "../jobs/scheduler.ts";
import type { Notifier } from "../notify/notifier.ts";
import type { AppliedChange, Store } from "../store.ts";
import { createFlowWriter } from "./writer.ts";

const MAX_WRITES = 10;
const MAX_NOTIFICATIONS = 3;
const CATCH_UP_MS = 6 * 60 * 60 * 1000;

export interface StepLog {
  step: number;
  type: Step["type"];
  outcome: string;
  /** Ids written by this step; what a dry run would write is described in `outcome`. */
  ids?: string[];
}
export interface RunLog {
  result: "ok" | "stopped" | "failed" | "missed";
  steps: StepLog[];
}
export interface FlowRun extends RunLog {
  key: string;
  startedAt: number;
}

interface EngineOptions {
  store: Store;
  db: Database;
  notifier: Notifier;
  now: () => number;
  zone: () => Zone;
  log?: (line: string) => void;
}

const isOn = (doc: Doc) => doc.data.status === "on" && doc.data._deleted !== true;

/** When the flow was last switched: slots before it don't count, so turning one on never "misses". */
const switchedAt = (doc: Doc) => {
  const stamp = doc.stamps.status;
  return stamp ? parseStamp(stamp).ms : 0;
};

export function createFlowEngine({
  store,
  db,
  notifier,
  now,
  zone,
  log = console.log,
}: EngineOptions) {
  const hasRun = db.query<{ key: string }, [string]>("SELECT key FROM flow_runs WHERE key = ?");
  const insertRun = db.query<void, [string, string, number, string, string]>(
    "INSERT OR IGNORE INTO flow_runs (key, flow_id, started_at, result, log) VALUES (?, ?, ?, ?, ?)",
  );
  const listRuns = db.query<
    { key: string; started_at: number; result: string; log: string },
    [string]
  >(
    "SELECT key, started_at, result, log FROM flow_runs WHERE flow_id = ? ORDER BY started_at DESC LIMIT 20",
  );
  const listRecent = db.query<
    { key: string; flow_id: string; started_at: number; result: string; log: string },
    [number]
  >("SELECT key, flow_id, started_at, result, log FROM flow_runs ORDER BY started_at DESC LIMIT ?");

  const definitionOf = (doc: Doc): FlowDefinition | undefined => {
    const parsed = parseDefinition(doc.data.definition);
    return parsed.ok ? parsed.value : undefined;
  };

  // Text values render their templates; a number field gets a number back.
  function renderFields(collection: string, fields: Record<string, unknown>, ctx: TemplateContext) {
    const types = new Map(fieldsOf(store.get(collection)).map((f) => [f.id, f.type]));
    return Object.fromEntries(
      Object.entries(fields).map(([key, value]) => {
        if (typeof value !== "string") return [key, value];
        const text = renderTemplate(value, ctx);
        const type = types.get(key);
        if ((type === "number" || type === "money") && text !== "" && Number.isFinite(Number(text)))
          return [key, Number(text)];
        return [key, text === "" ? null : text];
      }),
    );
  }

  /** Runs, or with `dryRun` describes, a flow's steps against an optional trigger item. */
  async function execute(
    flow: Doc,
    def: FlowDefinition,
    item: Doc | undefined,
    key: string,
    dryRun: boolean,
  ): Promise<RunLog> {
    const z = zone();
    const today = localDate(new Date(now()), z.timeZone);
    const ctx: TemplateContext = {
      ...(item ? { item: item.data } : {}),
      today,
      month: today.slice(0, 7),
    };
    const writer = createFlowWriter(store, flow.id, now);
    const steps: StepLog[] = [];
    let writes = 0;
    let notes = 0;
    let created: { id: string; collection: string } | undefined;
    const fail = (i: number, type: Step["type"], outcome: string): RunLog => {
      steps.push({ step: i, type, outcome: `failed: ${outcome}` });
      return { result: "failed", steps };
    };

    for (const [i, step] of def.steps.entries()) {
      switch (step.type) {
        case "if":
          if (!allHold(step.all, item?.data ?? {})) {
            steps.push({ step: i, type: step.type, outcome: "conditions not met, stopped" });
            return { result: "stopped", steps };
          }
          steps.push({ step: i, type: step.type, outcome: "conditions met" });
          break;
        case "create": {
          if (++writes > MAX_WRITES) return fail(i, step.type, `more than ${MAX_WRITES} writes`);
          const data = {
            _title: renderTemplate(step.title, ctx),
            ...renderFields(step.collection, step.fields ?? {}, ctx),
          };
          if (dryRun) {
            steps.push({
              step: i,
              type: step.type,
              outcome: `would create “${data._title}” in ${step.collection}`,
            });
            created = { id: "(new)", collection: step.collection };
            break;
          }
          const result = writer.create(step.collection, data);
          if (!result.ok) return fail(i, step.type, result.error);
          created = { id: result.id, collection: step.collection };
          steps.push({
            step: i,
            type: step.type,
            outcome: `created in ${step.collection}`,
            ids: [result.id],
          });
          break;
        }
        case "update-trigger-item": {
          if (!item) return fail(i, step.type, "no trigger item");
          if (++writes > MAX_WRITES) return fail(i, step.type, `more than ${MAX_WRITES} writes`);
          const data = renderFields(item.collection as string, step.fields, ctx);
          if (dryRun) {
            steps.push({
              step: i,
              type: step.type,
              outcome: `would change ${Object.keys(data).join(", ")}`,
            });
            break;
          }
          const result = writer.update(item, data);
          if (!result.ok) return fail(i, step.type, result.error);
          steps.push({
            step: i,
            type: step.type,
            outcome: "changed the trigger item",
            ids: [item.id],
          });
          break;
        }
        case "notify": {
          if (++notes > MAX_NOTIFICATIONS)
            return fail(i, step.type, `more than ${MAX_NOTIFICATIONS} notifications`);
          const title = renderTemplate(step.title, ctx);
          const path =
            step.open === "calendar"
              ? "/calendar"
              : step.open === "created-item" && created
                ? `/c/${created.collection}`
                : item
                  ? `/c/${item.collection}`
                  : "/";
          const ready = notifier.statuses().some((s) => s.status.ready);
          if (!ready) {
            steps.push({ step: i, type: step.type, outcome: "notify skipped: push off" });
            break;
          }
          if (dryRun) {
            steps.push({ step: i, type: step.type, outcome: `would notify “${title}”` });
            break;
          }
          const body = step.body ? renderTemplate(step.body, ctx) : undefined;
          const sent = await notifier.notify({
            key: `${key}:notify:${i}`,
            kind: "message",
            title,
            details: body ? [body] : [],
            path,
          });
          steps.push({
            step: i,
            type: step.type,
            outcome: `notified: ${sent.delivered} delivered, ${sent.failed} failed`,
          });
          break;
        }
      }
    }
    return { result: "ok", steps };
  }

  async function run(flow: Doc, def: FlowDefinition, item: Doc | undefined, key: string) {
    if (hasRun.get(key)) return;
    const startedAt = now();
    // Recorded first, so a crash mid-run never runs the same slot or change twice.
    insertRun.run(key, flow.id, startedAt, "running", "[]");
    let outcome: RunLog;
    try {
      outcome = await execute(flow, def, item, key, false);
    } catch (error) {
      outcome = {
        result: "failed",
        steps: [{ step: -1, type: "if", outcome: `failed: ${(error as Error).name}` }],
      };
    }
    db.run("UPDATE flow_runs SET result = ?, log = ? WHERE key = ?", [
      outcome.result,
      JSON.stringify(outcome.steps),
      key,
    ]);
    log(`flow ${flow.id}: ${outcome.result}`);
  }

  // Item triggers run one after another, after the write that caused them committed.
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (task: () => Promise<void>) => {
    queue = queue.then(task).catch((error) => log(`flow run failed: ${(error as Error).name}`));
  };

  function onChanges(changes: AppliedChange[]) {
    for (const change of changes) {
      // Flows never trigger flows: no loops. The seed isn't an event either.
      if (change.actor.startsWith("flow:") || change.actor === "seed") continue;
      const doc = change.doc;
      if (doc.kind !== "item" || doc.data._deleted === true || doc.collection === FLOWS) continue;
      for (const flow of store.itemsOf(FLOWS).filter(isOn)) {
        const def = definitionOf(flow);
        const t = def?.trigger;
        if (!def || !t || t.type === "schedule" || t.collection !== doc.collection) continue;
        if (t.type === "item-added") {
          const isNew = store.changesFor(doc.id, 2).length === 1;
          if (!isNew || !allHold(t.where, doc.data)) continue;
        } else {
          const key = t.field === "title" ? "_title" : t.field;
          if (!change.keys.includes(key)) continue;
          if (t.to !== undefined && !holds({ field: t.field, op: "=", value: t.to }, doc.data))
            continue;
        }
        const key = `flow:${flow.id}:${doc.id}:${change.seq}`;
        enqueue(() => run(flow, def, doc, key));
      }
    }
  }
  store.onApplied(onChanges);

  const job: Job = {
    id: "flows",
    label: "Scheduled flows",
    describeSchedule: () => "every 30 seconds",
    nextRun: every(30_000),
    async run({ now: at }) {
      let ran = 0;
      let missed = 0;
      const tz = zone().timeZone;
      for (const flow of store.itemsOf(FLOWS).filter(isOn)) {
        const def = definitionOf(flow);
        if (def?.trigger.type !== "schedule") continue;
        const slot = latestSlot(def.trigger, at, tz);
        if (slot === undefined || slot < switchedAt(flow)) continue;
        const key = `flow:${flow.id}:${new Date(slot).toISOString()}`;
        if (hasRun.get(key)) continue;
        if (at - slot > CATCH_UP_MS) {
          insertRun.run(key, flow.id, at, "missed", "[]");
          missed += 1;
          continue;
        }
        await run(flow, def, undefined, key);
        ran += 1;
      }
      await queue;
      return {
        result: "ok",
        summary: `${ran} ran, ${missed} missed`,
        didSomething: ran + missed > 0,
      };
    },
  };

  return {
    job,
    /** Waits for item-triggered runs already queued. */
    settled: () => queue,
    /** "Test run": against now, or the newest matching item; writes and sends nothing. */
    async dryRun(flowId: string): Promise<RunLog | { error: string }> {
      const flow = store.get(flowId);
      if (!flow || flow.collection !== FLOWS) return { error: "flow not found" };
      const def = definitionOf(flow);
      if (!def) return { error: "the definition is not valid" };
      let item: Doc | undefined;
      if (def.trigger.type !== "schedule") {
        const t = def.trigger;
        item = store
          .itemsOf(t.collection)
          .filter((d) => t.type !== "item-added" || allHold(t.where, d.data))
          .sort((a, b) => (store.seqOf(b.id) ?? 0) - (store.seqOf(a.id) ?? 0))[0];
        if (!item) return { error: `no item in ${t.collection} matches yet` };
      }
      return execute(flow, def, item, `dry:${flowId}`, true);
    },
    /** The newest runs of every flow, for Activity. */
    recent(limit: number): (FlowRun & { flowId: string })[] {
      return listRecent.all(limit).map((r) => ({
        key: r.key,
        flowId: r.flow_id,
        startedAt: r.started_at,
        result: r.result as RunLog["result"],
        steps: JSON.parse(r.log) as StepLog[],
      }));
    },
    runs(flowId: string): FlowRun[] {
      return listRuns.all(flowId).map((r) => ({
        key: r.key,
        startedAt: r.started_at,
        result: r.result as RunLog["result"],
        steps: JSON.parse(r.log) as StepLog[],
      }));
    },
  };
}
export type FlowEngine = ReturnType<typeof createFlowEngine>;
