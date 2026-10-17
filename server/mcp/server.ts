import { type CallToolResult, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { localDateTime } from "../../shared/dates.ts";
import { FlowDefinitionSchema } from "../../shared/flows/registry.ts";
import type { Hlc } from "../../shared/hlc.ts";
import { STEP_LIMITS, STEP_STATUSES } from "../../shared/runs.ts";
import type { CallLog } from "../agent-calls.ts";
import { AgentWriter, type WriteResult } from "../agent-writer.ts";
import type { Agent } from "../agents.ts";
import type { Store } from "../store.ts";
import { listFlows, MAX_ON_FLOWS, MAX_SAVES_PER_DAY, saveFlow } from "./flows.ts";
import { addNote } from "./note.ts";
import { getProject } from "./project.ts";
import {
  getItem,
  listCollections,
  moneyMonth,
  QUERY_MAX,
  query,
  type ToolOutcome,
} from "./read.ts";
import { finishRun, logStep, startRun } from "./runs.ts";

export interface McpDeps {
  store: Store;
  calls: CallLog;
  now: () => number;
  /** One clock per agent for the life of the process. */
  clocks: Map<string, Hlc>;
}

const DATA_RULE =
  "Never guess an amount, category or account: ask the owner, or leave the field out.";
const REMINDER_RULE =
  'Reminders: one whose repeat isn\'t "none" repeats on completion; done: true moves due to the next occurrence and keeps it open. The Cave sends their notifications itself; never set up outside scheduled tasks for them. To also create or change items on a schedule or when items change, use save_flow.';
const RADAR_RULE =
  "Radar: findings for the owner go in collection radar with fields url (http or https, required), why (one line on why it matters, required), source (your label, e.g. Hacker News) and interests (comma-separated names from settings.radarInterests); the summary goes in body. One item per address: a duplicate is refused with the existing id. At most 50 a day.";
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

type Outcome = ToolOutcome & { seqs?: number[] };

const fromWrite = (result: WriteResult): Outcome =>
  result.ok ? { ok: true, value: { id: result.id }, seqs: result.seqs } : result;

/**
 * The tools one agent may use, in a fixed order. Read tools need the `read` scope, write
 * tools `write`. Every call is logged with its arguments and outcome, reads included.
 */
export function buildServer(agent: Agent, deps: McpDeps): McpServer {
  const server = new McpServer({ name: "cave", version: "0.1.0" });
  const { store } = deps;
  const writer = () =>
    new AgentWriter(store, agent, AgentWriter.clockFor(deps.clocks, agent, deps.now), deps.now);
  const timeZone = () => {
    const tz = store.get("settings")?.data.timezone;
    return typeof tz === "string" ? tz : undefined;
  };

  async function run(
    tool: string,
    args: unknown,
    work: () => Outcome | Promise<Outcome>,
  ): Promise<CallToolResult> {
    const at = deps.now();
    let outcome: Outcome;
    try {
      outcome = await work();
    } catch (error) {
      deps.calls.record({
        agent: agent.name,
        tool,
        args: JSON.stringify(args ?? {}),
        at,
        ok: false,
        error: `internal error: ${(error as Error).message}`,
        changeSeqs: [],
      });
      throw error;
    }
    deps.calls.record({
      agent: agent.name,
      tool,
      args: JSON.stringify(args ?? {}),
      at,
      ok: outcome.ok,
      error: outcome.ok ? null : outcome.error,
      changeSeqs: outcome.seqs ?? [],
    });
    if (!outcome.ok) return { content: [{ type: "text", text: outcome.error }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(outcome.value) }],
      structuredContent: outcome.value,
    };
  }

  if (agent.scopes.includes("read")) {
    server.registerTool(
      "list_collections",
      {
        description:
          "List the collections you can see: id, name, fields (with select options) and item count.",
        annotations: READ,
      },
      () => run("list_collections", {}, () => listCollections(store, agent)),
    );
    server.registerTool(
      "query",
      {
        description: `Find items in a collection, newest first: equality filters on fields, a date range on its first date field, and text search in title and body. ${DATA_RULE}`,
        inputSchema: z.object({
          collection: z.string(),
          where: z
            .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
            .optional(),
          from: DAY.optional(),
          to: DAY.optional(),
          text: z.string().optional(),
          limit: z.number().int().min(1).max(QUERY_MAX).optional(),
          cursor: z.string().optional(),
        }),
        annotations: READ,
      },
      (args) => run("query", args, () => query(store, agent, args)),
    );
    server.registerTool(
      "get",
      {
        description: "Get one item: all its data, its Markdown body and its last 20 changes.",
        inputSchema: z.object({ id: z.string() }),
        annotations: READ,
      },
      (args) => run("get", args, () => getItem(store, agent, args.id)),
    );
    server.registerTool(
      "money_month",
      {
        description:
          "Income, spending, net, burn rate and spending by category for one month (YYYY-MM), counted the same way as the app's money dashboard, including entries it could not count. Transfers between own accounts (investments) are reported apart, never as spending or income. Transactions without a date belong to no month: `undated` and `undatedAmount` say how many and how much, and they are in no total.",
        inputSchema: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, "YYYY-MM") }),
        annotations: READ,
      },
      (args) => run("money_month", args, () => moneyMonth(store, agent, args.month, deps.now())),
    );
    server.registerTool(
      "get_project",
      {
        description:
          "Get one project (an item in projects): its data, its parts as a tree, its open tasks, and per collection how many items point at it (their `project` field) with the latest 20. Items link to a project through a `project` ref field holding its id; query with where {project: id} for more.",
        inputSchema: z.object({ id: z.string() }),
        annotations: READ,
      },
      (args) => run("get_project", args, () => getProject(store, agent, args.id)),
    );
    server.registerTool(
      "list_flows",
      {
        description:
          "List the owner's flows (automations): id, title, status (draft, on, off, pending-approval), who made it, its definition and a line per step.",
        annotations: READ,
      },
      () => run("list_flows", {}, () => listFlows(store, agent)),
    );
  }

  if (agent.scopes.includes("write")) {
    server.registerTool(
      "create",
      {
        description: `Create an item in a collection with a title, field values and a Markdown body. ${DATA_RULE} ${REMINDER_RULE} ${RADAR_RULE}`,
        inputSchema: z.object({
          collection: z.string(),
          title: z.string(),
          fields: z.record(z.string(), z.unknown()).optional(),
          body: z.string().optional(),
        }),
        annotations: WRITE,
      },
      (args) =>
        run("create", args, () =>
          fromWrite(
            writer().create(args.collection, {
              title: args.title,
              fields: args.fields,
              body: args.body,
            }),
          ),
        ),
    );
    server.registerTool(
      "update",
      {
        description: `Change an item's title, field values or body; only keys that change are written. ${DATA_RULE} ${REMINDER_RULE}`,
        inputSchema: z.object({
          id: z.string(),
          title: z.string().optional(),
          fields: z.record(z.string(), z.unknown()).optional(),
          body: z.string().optional(),
        }),
        // It replaces existing values, so clients that ask before destructive tools ask here.
        annotations: { ...WRITE, destructiveHint: true, idempotentHint: true },
      },
      (args) =>
        run("update", args, () =>
          fromWrite(
            writer().update(args.id, { title: args.title, fields: args.fields, body: args.body }),
          ),
        ),
    );
    server.registerTool(
      "propose_delete",
      {
        description:
          "Ask the owner to delete an item. Nothing is deleted until the owner approves it in the app.",
        inputSchema: z.object({ id: z.string(), reason: z.string() }),
        annotations: WRITE,
      },
      (args) =>
        run("propose_delete", args, () => fromWrite(writer().proposeDelete(args.id, args.reason))),
    );
    server.registerTool(
      "mark_paid",
      {
        description:
          "Mark a payment (from the payments collection) paid: it logs the expense with the payment's title, category and account, and moves the payment to its next date (a one-off one becomes inactive). Pass amount for payments whose amount varies (approx); otherwise the expected amount is used. date is local YYYY-MM-DDTHH:mm, default now. Never guess an amount.",
        inputSchema: z.object({
          id: z.string(),
          amount: z.number().positive().optional(),
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "YYYY-MM-DDTHH:mm")
            .optional(),
        }),
        annotations: WRITE,
      },
      (args) =>
        run("mark_paid", args, () => {
          const payment = store.get(args.id);
          const expected = payment?.data.amount;
          const amount =
            args.amount ??
            (payment?.data.approx === true || typeof expected !== "number" ? undefined : expected);
          if (amount === undefined)
            return {
              ok: false,
              error: "this payment's amount varies: pass amount (ask the owner)",
            };
          const date = args.date ?? localDateTime(new Date(deps.now()), timeZone());
          const result = writer().markPaid(args.id, { amount, date });
          return result.ok
            ? {
                ok: true,
                value: { expense: result.expense, payment: args.id, next: result.next },
                seqs: result.seqs,
              }
            : result;
        }),
    );
    server.registerTool(
      "save_flow",
      {
        description: `Create or replace a flow. It runs as soon as it is on. Flows that change existing items, or that use a sensitive step, wait for the owner's approval (status pending-approval), and only the owner can approve. Pass id to replace a flow from list_flows. Templates: {{item.title}}, {{item.<field>}}, {{item.<field>|pct:N}}, {{today}}, {{month}}. At most ${MAX_ON_FLOWS} flows on per agent and ${MAX_SAVES_PER_DAY} saves a day. A reminder only notifies; use a flow when something must also be created or changed. ${DATA_RULE}`,
        inputSchema: z.object({
          id: z.string().optional(),
          title: z.string(),
          description: z.string().optional(),
          status: z.enum(["on", "draft", "off"]).optional(),
          definition: FlowDefinitionSchema,
        }),
        annotations: { ...WRITE, destructiveHint: true },
      },
      (args) =>
        run("save_flow", args, () => {
          const result = saveFlow(store, agent, writer(), deps.calls, args, deps.now());
          return result.ok
            ? { ok: true, value: { id: result.id, status: result.status }, seqs: result.seqs }
            : result;
        }),
    );
    const runDeps = { store, agent, writer, now: deps.now, timeZone };
    server.registerTool(
      "start_run",
      {
        description: `Start a run: the trace of work you are doing on one of the owner's projects (from query projects or get_project), optionally on one of its parts. Returns the run id. Log a step per meaningful action with log_step and end with finish_run; the owner watches it live in the project's Activity. Titles and details are shown as plain text. ${DATA_RULE}`,
        inputSchema: z.object({
          project: z.string(),
          title: z.string(),
          part: z.string().optional(),
        }),
        annotations: WRITE,
      },
      (args) => run("start_run", args, () => fromWrite(startRun(runDeps, args))),
    );
    server.registerTool(
      "log_step",
      {
        description: `Add a step to a run you started: a short title, its status (running, done, failed, waiting, skipped) and an optional detail. At most ${STEP_LIMITS.steps} steps per run; a finished run takes no more.`,
        inputSchema: z.object({
          run: z.string(),
          title: z.string().min(1).max(STEP_LIMITS.title),
          status: z.enum(STEP_STATUSES),
          detail: z.string().max(STEP_LIMITS.detail).optional(),
        }),
        annotations: WRITE,
      },
      (args) => run("log_step", args, () => fromWrite(logStep(runDeps, args))),
    );
    server.registerTool(
      "finish_run",
      {
        description:
          "Finish a run you started: done, failed or cancelled, with a one-paragraph summary of what happened.",
        inputSchema: z.object({
          run: z.string(),
          status: z.enum(["done", "failed", "cancelled"]),
          summary: z.string(),
        }),
        annotations: WRITE,
      },
      (args) => run("finish_run", args, () => fromWrite(finishRun(runDeps, args))),
    );
    server.registerTool(
      "add_note",
      {
        description:
          "Save a new Markdown note in the owner's Notes Inbox, marked as written by you. Use [[Title]] to link another note. It never changes an existing note.",
        inputSchema: z.object({ title: z.string(), body: z.string() }),
        annotations: WRITE,
      },
      (args) =>
        run("add_note", { title: args.title, bodyLength: args.body.length }, () =>
          fromWrite(addNote(writer(), args)),
        ),
    );
  }
  return server;
}
