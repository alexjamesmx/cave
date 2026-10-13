import { useState } from "react";
import { TOKEN_KEY } from "../app/boot.ts";
import { useCave } from "../app/context.ts";

export function Settings() {
  const cave = useCave();
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");

  const save = () => {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    cave.syncNow();
  };

  return (
    <>
      <h1 style={{ margin: 0, fontSize: 32, letterSpacing: "-0.03em" }}>Settings</h1>
      <section className="panel" style={{ padding: 18, display: "grid", gap: 14, maxWidth: 560 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span className="k">Server token</span>
          <input
            className="input"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Only needed when the server sets CAVE_TOKEN"
          />
        </label>
        <div>
          <button type="button" className="btn primary" onClick={save}>
            Save and sync
          </button>
        </div>
        <div className="muted" style={{ fontSize: 13 }}>
          Device <span className="num">{cave.local.deviceId}</span>
        </div>
      </section>
    </>
  );
}
