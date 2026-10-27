/**
 * The Cave's MCP tools, in the order the server registers them, with the scope each needs.
 * The AI Overview draws them; a test keeps this list and the server's in step.
 */
export const CAVE_TOOLS: { name: string; scope: "read" | "write" }[] = [
  { name: "list_collections", scope: "read" },
  { name: "query", scope: "read" },
  { name: "get", scope: "read" },
  { name: "money_month", scope: "read" },
  { name: "get_project", scope: "read" },
  { name: "list_flows", scope: "read" },
  { name: "get_routine", scope: "read" },
  { name: "create", scope: "write" },
  { name: "update", scope: "write" },
  { name: "propose_delete", scope: "write" },
  { name: "mark_paid", scope: "write" },
  { name: "save_flow", scope: "write" },
  { name: "set_routine", scope: "write" },
  { name: "add_habit", scope: "write" },
  { name: "start_run", scope: "write" },
  // `log_step(question: true)` also writes a task for the owner; `get_project` returns the answer.
  { name: "log_step", scope: "write" },
  { name: "finish_run", scope: "write" },
  { name: "add_note", scope: "write" },
];
