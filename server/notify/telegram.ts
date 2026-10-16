import { localDate, localDateTime } from "../../shared/dates.ts";
import { FLOWS } from "../../shared/flows/seed.ts";
import type { NotificationSettings } from "../../shared/notifications.ts";
import { complete, snooze, type Zone } from "../../shared/reminders.ts";
import type { Doc } from "../../shared/types.ts";
import { parseReminder, preview } from "../../shared/when.ts";
import { every, type Job } from "../jobs/scheduler.ts";
import type { Store } from "../store.ts";
import type { ChannelState } from "./channel-state.ts";
import type { ChannelWriter } from "./channel-writer.ts";
import { dueList } from "./due-list.ts";
import { describeDue } from "./reminder-sweep.ts";
import type { TelegramApi, TelegramUpdate } from "./telegram-api.ts";
import type { Message, NotificationChannel, SendResult } from "./types.ts";

interface TelegramState {
  chatId: number;
  /** The next update to read: last update id + 1. */
  offset: number;
  /** A pending link: the code's hash, never the code. */
  link: { hash: string; expiresAt: number };
}

export const LINK_TTL_MS = 10 * 60 * 1000;
const POLL_SECONDS = 25;
// Easy to read and type on a phone: no 0/O or 1/I.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const HELP = [
  "The Cave",
  "/remind <text> <when>: remind pay rent tomorrow 9am",
  "/due: overdue, today and tomorrow",
  "/flows: automations and their status",
  "/help: this list",
].join("\n");

const hash = (code: string) => new Bun.CryptoHasher("sha256").update(code).digest("hex");

/** An action carried by a button: `<action>:<item id>`, well under Telegram's 64 bytes. */
type Action = "done" | "snooze60" | "tdone" | "tsnooze" | "approve" | "reject";
const ACTIONS = new Set<string>(["done", "snooze60", "tdone", "tsnooze", "approve", "reject"]);

export interface Approvals {
  /** What a button names: the flow and the definition it was shown with. */
  ref(flow: Doc): string;
  /** Approves or rejects a flow waiting for approval by its `ref`; returns what to tell the owner. */
  decide(ref: string, approve: boolean): string;
}

export interface TelegramOptions {
  api: TelegramApi | undefined;
  state: ChannelState;
  store: Store;
  writer: ChannelWriter;
  zone: () => Zone;
  settings: () => NotificationSettings;
  now: () => number;
  /** Flows waiting for approval; absent until Part C. */
  approvals?: Approvals;
  log?: (line: string) => void;
}

/**
 * Two-way Telegram: notifications with buttons, and a few commands, for one bound chat only.
 * Updates arrive by long polling (no webhook, so no inbound route). Chats with bots are not
 * end-to-end encrypted, so what goes out follows the `titles`/`full` setting.
 */
export function createTelegram({
  api,
  state,
  store,
  writer,
  zone,
  settings,
  now,
  approvals,
  log = console.log,
}: TelegramOptions) {
  const read = () => state.get<TelegramState>("telegram");
  const save = (patch: Partial<TelegramState>) =>
    state.set("telegram", { ...read(), ...patch }, now());
  const linked = () => typeof read().chatId === "number";
  const linkPending = () => (read().link?.expiresAt ?? 0) > now();

  const tomorrowAt = (day: string) => {
    const [y, m, d] = day.split("-").map(Number) as [number, number, number];
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  };

  const keyboard = (
    kind: Message["kind"] | "task",
    itemId: string | undefined,
    url: string | undefined,
  ) => {
    const rows: { text: string; callback_data?: string; url?: string }[][] = [];
    if (itemId && kind === "reminder")
      rows.push([
        { text: "Done", callback_data: `done:${itemId}` },
        { text: "Snooze 1h", callback_data: `snooze60:${itemId}` },
      ]);
    if (itemId && kind === "task")
      rows.push([
        { text: "Done", callback_data: `tdone:${itemId}` },
        { text: "Snooze", callback_data: `tsnooze:${itemId}` },
      ]);
    if (itemId && kind === "flow")
      rows.push([
        ...(settings().telegramApprovals
          ? [{ text: "Approve", callback_data: `approve:${itemId}` }]
          : []),
        { text: "Reject", callback_data: `reject:${itemId}` },
      ]);
    if (url) rows.push([{ text: "Open", url }]);
    return rows.length > 0 ? { reply_markup: { inline_keyboard: rows } } : {};
  };

  async function reply(chatId: number, text: string, extra: Record<string, unknown> = {}) {
    await api?.sendMessage({ chat_id: chatId, text, ...extra });
  }

  const channel: NotificationChannel = {
    id: "telegram",
    label: "Telegram",
    status() {
      if (!api) return { ready: false, summary: "needs a bot token" };
      if (!linked()) return { ready: false, summary: "needs linking" };
      return { ready: true, summary: "linked" };
    },
    async send(message): Promise<SendResult> {
      const chatId = read().chatId;
      if (!api || chatId === undefined) return { delivered: 0, failed: 0 };
      const text = message.body ? `${message.title}\n${message.body}` : message.title;
      await reply(chatId, text, keyboard(message.kind, message.itemId, message.url));
      return { delivered: 1, failed: 0 };
    },
  };

  function apply(action: Action, id: string): string {
    // The approvals toggle is checked before anything is looked up.
    if (action === "approve" || action === "reject") {
      if (action === "approve" && !settings().telegramApprovals)
        return "Approving from Telegram is off. Approve in the Cave, or turn it on in Settings.";
      return approvals?.decide(id, action === "approve") ?? "Approvals are off.";
    }
    const doc = store.get(id);
    if (!doc || doc.data._deleted === true || doc.kind !== "item") return "That item is gone.";
    const z = zone();
    switch (action) {
      case "done":
        if (doc.collection !== "reminders") return "Not a reminder.";
        writer.update(doc, complete(doc, now(), z));
        return "Done ✓";
      case "snooze60": {
        if (doc.collection !== "reminders") return "Not a reminder.";
        const patch = snooze(doc, 60, now(), z.timeZone);
        writer.update(doc, patch);
        return `Snoozed to ${String(patch.due).slice(11, 16)}`;
      }
      case "tdone":
        if (doc.collection !== "tasks") return "Not a task.";
        writer.update(doc, {
          status: "done",
          completed: localDateTime(new Date(now()), z.timeZone),
        });
        return "Done ✓";
      case "tsnooze": {
        if (doc.collection !== "tasks") return "Not a task.";
        const today = localDate(new Date(now()), z.timeZone);
        const due = typeof doc.data.due === "string" ? doc.data.due.slice(0, 10) : today;
        const next = tomorrowAt(due < today ? today : due);
        writer.update(doc, { due: next });
        return `Moved to ${next}`;
      }
    }
  }

  async function command(chatId: number, text: string) {
    const [head = "", ...rest] = text.trim().split(/\s+/);
    const name = head.toLowerCase().replace(/@.*$/, "");
    const z = zone();
    if (name === "/remind") {
      const when = { now: new Date(now()), timeZone: z.timeZone, reminderTime: z.defaultTime };
      const parsed = parseReminder(rest.join(" "), when);
      if (!parsed.ok) return reply(chatId, parsed.hint);
      writer.create("reminders", {
        _title: parsed.title,
        due: parsed.due,
        repeat: parsed.repeat,
        done: false,
      });
      return reply(chatId, `Saved · ${preview(parsed, when)}`);
    }
    if (name === "/due") {
      const entries = dueList(store, z, now());
      if (entries.length === 0) return reply(chatId, "Nothing due today or tomorrow.");
      const full = settings().detail.telegram === "full";
      for (const e of entries) {
        const title = typeof e.doc.data._title === "string" ? e.doc.data._title : "Untitled";
        const when = full
          ? ` · ${e.collection === "reminders" ? describeDue(e.due, z) : e.due}`
          : "";
        await reply(
          chatId,
          `${e.group}: ${title}${when}`,
          keyboard(e.collection === "tasks" ? "task" : "reminder", e.doc.id, undefined),
        );
      }
      return;
    }
    if (name === "/flows") {
      const flows = store.itemsOf(FLOWS).filter((d) => d.data._deleted !== true);
      if (flows.length === 0) return reply(chatId, "No flows yet.");
      const title = (d: Doc) => (typeof d.data._title === "string" ? d.data._title : "Untitled");
      const pending = flows.filter((d) => d.data.status === "pending-approval");
      const rest = flows.filter((d) => d.data.status !== "pending-approval");
      if (rest.length > 0)
        await reply(chatId, rest.map((d) => `${title(d)} · ${String(d.data.status)}`).join("\n"));
      for (const d of pending)
        await reply(
          chatId,
          `Waiting for approval: ${title(d)}`,
          keyboard("flow", approvals?.ref(d) ?? d.id, undefined),
        );
      return;
    }
    if (name === "/start") return reply(chatId, "This chat is already linked to the Cave.");
    return reply(chatId, HELP);
  }

  async function handle(update: TelegramUpdate) {
    const bound = read().chatId;
    const message = update.message;
    if (message) {
      const chatId = message.chat.id;
      if (bound === undefined) {
        const code = /^\/start\s+([A-Za-z0-9]+)$/.exec(message.text?.trim() ?? "")?.[1];
        const link = read().link;
        if (code && link && link.expiresAt > now() && hash(code.toUpperCase()) === link.hash) {
          state.set("telegram", { offset: read().offset, chatId }, now());
          log("telegram: chat linked");
          await reply(
            chatId,
            "Linked. Reminders from the Cave will arrive here. /help lists the commands.",
          );
        } else {
          // Content from a chat that isn't the owner's is never logged.
          log("telegram: ignored a message from an unlinked chat");
        }
        return;
      }
      if (chatId !== bound) return log("telegram: ignored a message from another chat");
      await command(chatId, message.text ?? "");
      return;
    }
    const query = update.callback_query;
    if (!query) return;
    const chat = query.message?.chat.id;
    if (bound === undefined || chat !== bound)
      return log("telegram: ignored a button from another chat");
    const [action, id] = (query.data ?? "").split(":");
    const answer =
      action && id && ACTIONS.has(action) ? apply(action as Action, id) : "Unknown button.";
    await api?.answerCallbackQuery({ callback_query_id: query.id, text: answer });
    const changed = ["Done", "Snoozed", "Moved"].some((word) => answer.startsWith(word));
    if (query.message && changed) {
      await api?.editMessageText({
        chat_id: chat,
        message_id: query.message.message_id,
        text: answer,
      });
    }
  }

  const job: Job = {
    id: "telegram",
    label: "Telegram updates",
    describeSchedule: () => "long polling while linked or linking",
    nextRun: every(0),
    async run() {
      if (!api || (!linked() && !linkPending())) {
        return { result: "skipped", summary: "not linked", didSomething: false };
      }
      const updates = await api.getUpdates(read().offset, POLL_SECONDS);
      for (const update of updates) {
        await handle(update);
        // Saved after each update, so a restart never handles one twice.
        save({ offset: update.update_id + 1 });
      }
      return {
        result: "ok",
        summary: `${updates.length} updates`,
        didSomething: updates.length > 0,
      };
    },
  };

  return {
    channel,
    job,
    linked,
    /** A one-time code the owner sends as `/start <code>`; valid for 10 minutes. */
    async startLink(): Promise<{ code: string; expiresAt: number; bot: string | undefined }> {
      const bytes = crypto.getRandomValues(new Uint8Array(6));
      const code = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
      const expiresAt = now() + LINK_TTL_MS;
      save({ link: { hash: hash(code), expiresAt } });
      const bot = await api
        ?.getMe()
        .then((me) => me.username)
        .catch(() => undefined);
      return { code, expiresAt, bot };
    },
    unlink() {
      state.set("telegram", { offset: read().offset }, now());
    },
  };
}
export type Telegram = ReturnType<typeof createTelegram>;
