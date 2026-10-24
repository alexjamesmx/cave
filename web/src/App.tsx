import { useEffect } from "react";
import { parseRoute, replacePath, usePathname } from "./app/router.ts";
import { SECTIONS, type Section, sectionById } from "./app/sections.ts";
import { ReminderLink } from "./pages/ReminderLink.tsx";
import { SectionPage } from "./pages/SectionPage.tsx";
import { Shell } from "./ui/Shell.tsx";

/** An old path: swap it for its new home, keeping the query string. */
function Redirect({ to }: { to: string }) {
  useEffect(() => replacePath(to), [to]);
  return null;
}

export function App() {
  const route = parseRoute(usePathname());
  return (
    <Shell route={route}>
      {route.name === "section" && (
        <SectionPage
          section={sectionById(route.section) ?? (SECTIONS[0] as Section)}
          tabId={route.tab}
          rest={route.rest}
        />
      )}
      {route.name === "reminder" && <ReminderLink key={route.id} id={route.id} />}
      {route.name === "redirect" && <Redirect to={route.to} />}
      {route.name === "not-found" && <p className="muted">Nothing here yet.</p>}
    </Shell>
  );
}
