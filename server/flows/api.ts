import type { FlowEngine } from "./engine.ts";

type Req = Request & { params: Record<string, string> };

const RECENT = 100;

/** The owner's flow routes: a test run that writes and sends nothing, and the run history. */
export function flowRoutes(engine: FlowEngine) {
  return {
    async test(req: Req) {
      const result = await engine.dryRun(req.params.id ?? "");
      // A flow that can't run yet is a test result, shown as is; only a missing flow is a 404.
      const missing = "error" in result && result.error === "flow not found";
      return Response.json(result, { status: missing ? 404 : 200 });
    },
    runs(req: Req) {
      return Response.json({ runs: engine.runs(req.params.id ?? "") });
    },
    /** Every flow's newest runs, for Projects → Activity; ids and step outcomes, never secrets. */
    recent() {
      return Response.json({ runs: engine.recent(RECENT) });
    },
  };
}
export type FlowRoutes = ReturnType<typeof flowRoutes>;
