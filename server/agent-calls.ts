import type { Database } from "bun:sqlite";

/** Longest stored form of a call's arguments; the log is for reading, not replay. */
const MAX_ARGS_CHARS = 2048;

export interface AgentCall {
  seq: number;
  agent: string;
  tool: string;
  /** JSON, cut at {@link MAX_ARGS_CHARS} characters. */
  args: string;
  at: number;
  ok: boolean;
  error: string | null;
  /** Change rows this call wrote, for undo. */
  changeSeqs: number[];
}

interface CallRow {
  seq: number;
  agent: string;
  tool: string;
  args: string;
  at: number;
  ok: number;
  error: string | null;
  change_seqs: string;
}

const toCall = (row: CallRow): AgentCall => ({
  seq: row.seq,
  agent: row.agent,
  tool: row.tool,
  args: row.args,
  at: row.at,
  ok: row.ok === 1,
  error: row.error,
  changeSeqs: JSON.parse(row.change_seqs),
});

export interface CallLog {
  record(call: Omit<AgentCall, "seq">): number;
  /** Newest first, older than `before` when given. */
  page(before: number | undefined, limit: number): AgentCall[];
  lastAt(agent: string): number | undefined;
  /** Successful calls of one tool by one agent since `since`, for daily limits. */
  countSince(agent: string, tool: string, since: number): number;
}

export function createCallLog(db: Database): CallLog {
  const insert = db.query<
    { seq: number },
    [string, string, string, number, number, string | null, string]
  >(
    `INSERT INTO agent_calls (agent, tool, args, at, ok, error, change_seqs)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING seq`,
  );
  const newest = db.query<CallRow, [number]>("SELECT * FROM agent_calls ORDER BY seq DESC LIMIT ?");
  const older = db.query<CallRow, [number, number]>(
    "SELECT * FROM agent_calls WHERE seq < ? ORDER BY seq DESC LIMIT ?",
  );
  const last = db.query<{ at: number }, [string]>(
    "SELECT at FROM agent_calls WHERE agent = ? ORDER BY seq DESC LIMIT 1",
  );
  const count = db.query<{ n: number }, [string, string, number]>(
    "SELECT count(*) AS n FROM agent_calls WHERE agent = ? AND tool = ? AND ok = 1 AND at >= ?",
  );
  return {
    record: (call) => {
      const row = insert.get(
        call.agent,
        call.tool,
        call.args.slice(0, MAX_ARGS_CHARS),
        call.at,
        call.ok ? 1 : 0,
        call.error,
        JSON.stringify(call.changeSeqs),
      );
      if (!row) throw new Error("agent_calls insert returned no seq");
      return row.seq;
    },
    page: (before, limit) =>
      (before === undefined ? newest.all(limit) : older.all(before, limit)).map(toCall),
    lastAt: (agent) => last.get(agent)?.at,
    countSince: (agent, tool, since) => count.get(agent, tool, since)?.n ?? 0,
  };
}
