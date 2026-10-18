// First: zod's settings must exist before any module builds a schema.
import "./zod-config.ts";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { boot } from "./app/boot.ts";
import { CaveContext } from "./app/context.ts";
import { hasToken } from "./app/lock.ts";
import { interceptLinks, listenForShortcuts } from "./app/router.ts";
import { warmShellCache } from "./app/shell-cache.ts";
// Fonts ship with the app (SIL OFL), so the shell works offline and no request leaves the origin.
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/newsreader";
import "@fontsource-variable/newsreader/wght-italic.css";
import "./styles.css";
import { LockScreen } from "./ui/LockScreen.tsx";

const container = document.getElementById("root");
if (!container) throw new Error("index.html has no #root");

// Without a token nothing opens: no local copy, no sync, only the lock screen.
if (!hasToken()) {
  createRoot(container).render(
    <StrictMode>
      <LockScreen />
    </StrictMode>,
  );
} else {
  const cave = await boot();
  void navigator.storage?.persist?.();
  interceptLinks(document);
  listenForShortcuts(document);
  createRoot(container).render(
    <StrictMode>
      <CaveContext value={cave}>
        <App />
      </CaveContext>
    </StrictMode>,
  );
}

// After the first render, so registering never delays the app opening.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js")
    .then(() => navigator.serviceWorker.ready)
    .then(warmShellCache)
    .catch((error: unknown) => {
      console.warn("Offline shell not set up; the app needs the network to open", error);
    });
}
