import { parseRoute, usePathname } from "./app/router.ts";
import { Agents } from "./pages/Agents.tsx";
import { Calendar } from "./pages/Calendar.tsx";
import { CollectionPage } from "./pages/CollectionPage.tsx";
import { Flows } from "./pages/Flows.tsx";
import { Home } from "./pages/Home.tsx";
import { ReminderLink } from "./pages/ReminderLink.tsx";
import { Settings } from "./pages/Settings.tsx";
import { Shell } from "./ui/Shell.tsx";

export function App() {
  const route = parseRoute(usePathname());
  return (
    <Shell route={route}>
      {route.name === "home" && <Home />}
      {route.name === "collection" && (
        <CollectionPage key={route.collection} id={route.collection} viewId={route.view} />
      )}
      {route.name === "calendar" && <Calendar />}
      {route.name === "flows" && <Flows id={route.id} />}
      {route.name === "reminder" && <ReminderLink key={route.id} id={route.id} />}
      {route.name === "settings" && <Settings />}
      {route.name === "agents" && <Agents />}
      {route.name === "not-found" && <p className="muted">Nothing here yet.</p>}
    </Shell>
  );
}
