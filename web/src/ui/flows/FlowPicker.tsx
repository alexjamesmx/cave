import { FLOWS } from "../../../../shared/flows/seed.ts";
import { newId } from "../../../../shared/ids.ts";
import { useCave } from "../../app/context.ts";
import { flowPath, navigate } from "../../app/router.ts";
import { blankFlow } from "../../logic/flow-edit.ts";
import { titleOf } from "../../logic/views.ts";
import { useSystemReport } from "../../pages/settings/shared.tsx";
import { useItems } from "../../store/queries.ts";
import { Icon } from "../icon.tsx";

const statusText = (s: unknown) => (s === "pending-approval" ? "pending approval" : String(s));

/** The path of a built-in job's card. */
export const jobPath = (id: string) => `/flows/jobs/${encodeURIComponent(id)}`;

/**
 * The one list of everything the Cave runs on its own (M12 part 4): the owner's flows, then
 * the server's built-in jobs (reminders, payments, the budget, the digest, backups, the
 * off-box copy, flows' schedule, Telegram's poll). A flow opens on the canvas, a job on its
 * card; New flow starts a draft.
 */
export function FlowPicker({ flowId, jobId }: { flowId?: string; jobId?: string }) {
  const { local } = useCave();
  const flows = (useItems(local.db, FLOWS) ?? []).filter((d) => d.data._deleted !== true);
  const { server } = useSystemReport();
  const jobs = typeof server === "object" ? server.jobs : [];
  const value = jobId ? `job:${jobId}` : (flowId ?? "");

  const create = async () => {
    const id = newId();
    await local.write(
      { id, kind: "item", collection: FLOWS },
      { _title: "New flow", status: "draft", definition: blankFlow(), author: "owner" },
    );
    navigate(flowPath(id));
  };

  return (
    <div className="flow-picker">
      <select
        className="input"
        aria-label="Flow"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          navigate(v.startsWith("job:") ? jobPath(v.slice(4)) : flowPath(v || undefined));
        }}
        style={{ width: "auto", maxWidth: 320 }}
      >
        {flows.length === 0 && <option value="">No flows yet</option>}
        <optgroup label="Your flows">
          {flows.map((f) => (
            <option key={f.id} value={f.id}>
              {titleOf(f)} · {statusText(f.data.status)}
            </option>
          ))}
        </optgroup>
        {jobs.length > 0 && (
          <optgroup label="Built in">
            {jobs.map((j) => (
              <option key={j.id} value={`job:${j.id}`}>
                {j.label}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <button type="button" className="btn" onClick={() => void create()}>
        <Icon name="plus" size={15} /> New flow
      </button>
    </div>
  );
}
