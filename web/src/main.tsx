import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { boot } from "./app/boot.ts";
import { CaveContext } from "./app/context.ts";
import { interceptLinks } from "./app/router.ts";
// Fonts ship with the app (SIL OFL), so the shell works offline and no request leaves the origin.
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/newsreader";
import "@fontsource-variable/newsreader/wght-italic.css";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("index.html has no #root");

const cave = await boot();
void navigator.storage?.persist?.();
interceptLinks(document);

createRoot(container).render(
  <StrictMode>
    <CaveContext value={cave}>
      <App />
    </CaveContext>
  </StrictMode>,
);
