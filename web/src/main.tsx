import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { boot } from "./app/boot.ts";
import { CaveContext } from "./app/context.ts";
import { interceptLinks } from "./app/router.ts";
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
