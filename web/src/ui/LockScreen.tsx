import { type FormEvent, useState } from "react";
import { unlock } from "../app/lock.ts";
import { Icon } from "./icon.tsx";

/** All a device without a token sees: no sidebar, no page, nothing from the local copy. */
export function LockScreen() {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const refused = await unlock(token);
    setBusy(false);
    if (refused) return setError(refused);
    location.reload();
  };

  return (
    <main className="lock">
      <form className="panel lock-card" onSubmit={(e) => void submit(e)}>
        <div className="brand-mark" aria-hidden="true">
          <Icon name="zap" size={22} strokeWidth={2.2} />
        </div>
        <h1 style={{ margin: 0, fontSize: 26 }}>Cave</h1>
        <label style={{ display: "grid", gap: 6, width: "100%" }}>
          <span className="k">Server token</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="error" style={{ margin: 0 }}>
            {error}
          </p>
        )}
        <button type="submit" className="btn primary" disabled={busy || !token.trim()}>
          Unlock
        </button>
      </form>
    </main>
  );
}
