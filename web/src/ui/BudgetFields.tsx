import { type Budget, budgetOf } from "../../../shared/budget.ts";
import { useCave } from "../app/context.ts";
import { useDoc } from "../store/queries.ts";

const SETTINGS = { id: "settings", kind: "setting" as const, collection: null };

/**
 * The two budget numbers (M12 part 2), edited on Money → Overview and Settings → General:
 * a monthly spending limit and a monthly saving target. Empty clears one; nothing is derived.
 */
export function BudgetFields() {
  const { local } = useCave();
  const budget = budgetOf(useDoc(local.db, "settings")?.data);
  const save = (key: keyof Budget, raw: string) => {
    const value = Number(raw);
    const next: Budget = { ...budget };
    if (raw.trim() && value > 0) next[key] = value;
    else delete next[key];
    if ((next[key] ?? null) === (budget[key] ?? null)) return;
    void local.write(SETTINGS, { budget: Object.keys(next).length ? next : null });
  };
  const field = (key: keyof Budget, label: string, hint: string) => (
    <label className="quick-field">
      <span className="k">{label}</span>
      <input
        key={budget[key] ?? ""}
        className="input num"
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        defaultValue={budget[key] ?? ""}
        placeholder={hint}
        onBlur={(e) => save(key, e.target.value)}
      />
    </label>
  );
  return (
    <div className="quick-row">
      {field("monthlyLimit", "Monthly limit", "What you can spend a month")}
      {field("savingTarget", "Saving target", "What you want to keep a month")}
    </div>
  );
}
