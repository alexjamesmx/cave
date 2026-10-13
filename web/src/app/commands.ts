import { dayOf, localDate, localDateTime } from "../../../shared/dates.ts";
import { newId } from "../../../shared/ids.ts";
import type { Command } from "../logic/command.ts";
import { signedMoney } from "../logic/format.ts";
import type { LocalStore } from "../store/local-store.ts";

export interface CommandResult {
  message: string;
  /** Where to go next, for jumps. */
  path?: string;
  ok: boolean;
}

interface Context {
  local: LocalStore;
  timeZone: string | undefined;
  now: Date;
}

const item = (collection: string, id = newId()) => ({ id, kind: "item" as const, collection });

/** Carries out a parsed command bar entry against the local store. */
export async function runCommand(
  cmd: Command,
  { local, timeZone, now }: Context,
): Promise<CommandResult> {
  switch (cmd.kind) {
    case "money": {
      await local.write(item("money"), {
        _title: cmd.title,
        amount: cmd.amount,
        direction: cmd.direction,
        date: localDateTime(now, timeZone),
        ...(cmd.category ? { category: cmd.category } : {}),
      });
      const what = cmd.title ? ` ${cmd.title}` : "";
      const tag = cmd.category ? ` · ${cmd.category}` : " · untagged";
      return { ok: true, message: `Logged ${signedMoney(cmd.amount, cmd.direction)}${what}${tag}` };
    }
    case "task":
      await local.write(item("tasks"), { _title: cmd.title, status: "todo" });
      return { ok: true, message: `Task added: ${cmd.title}` };
    case "habit": {
      const today = localDate(now, timeZone);
      const journal = await local.db.docs.where("collection").equals("journal").toArray();
      const entry = journal.find((d) => d.data._deleted !== true && dayOf(d.data.date) === today);
      const done = entry?.data[cmd.habit] !== true;
      await local.write(
        item("journal", entry?.id),
        entry ? { [cmd.habit]: done } : { date: today, _title: today, [cmd.habit]: done },
      );
      return { ok: true, message: `${cmd.habit} ${done ? "done" : "undone"} for today` };
    }
    case "ask":
      return { ok: false, message: "Asking needs the AI adapter, which isn't built yet." };
    case "jump":
      return { ok: true, message: "", path: cmd.path };
    case "reject":
      return { ok: false, message: cmd.hint };
  }
}
