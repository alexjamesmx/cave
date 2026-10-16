import type { ReactNode } from "react";
import { type PageId, type Section, tabPath, visibleTabs } from "../app/sections.ts";
import { Icon } from "../ui/icon.tsx";
import { Agents } from "./Agents.tsx";
import { AiActivity, AiOverview } from "./AiHome.tsx";
import { AiPage } from "./AiPage.tsx";
import { Calendar } from "./Calendar.tsx";
import { CollectionView } from "./CollectionPage.tsx";
import { Flows } from "./Flows.tsx";
import { Home } from "./Home.tsx";
import { ReviewCategories } from "./ReviewCategories.tsx";
import {
  SettingsData,
  SettingsDevices,
  SettingsGeneral,
  SettingsNotifications,
} from "./Settings.tsx";
import { System } from "./System.tsx";

/** Each page tab's component; \`rest\` is the path after the tab (a flow id, a collection). */
const PAGES: Record<PageId, (rest: string[]) => ReactNode> = {
  home: () => <Home />,
  "calendar-month": () => <Calendar mode="month" />,
  "calendar-agenda": () => <Calendar mode="agenda" />,
  review: () => <ReviewCategories />,
  "projects-all": () => <CollectionView id="projects" viewId={undefined} />,
  agents: () => <Agents />,
  flows: (rest) => <Flows id={rest[0]} />,
  "ai-overview": () => <AiOverview />,
  "ai-setup": () => <AiPage />,
  "ai-activity": () => <AiActivity />,
  "settings-general": () => <SettingsGeneral />,
  "settings-notifications": () => <SettingsNotifications />,
  "settings-devices": () => <SettingsDevices />,
  "settings-data": (rest) => <SettingsData rest={rest} />,
  "settings-system": (rest) => <System tab={rest[0]} />,
};

/** A section: its title, its tab bar (scrolls on a phone) and the open tab. */
export function SectionPage({
  section,
  tabId,
  rest,
}: {
  section: Section;
  tabId: string;
  rest: string[];
}) {
  const tab = section.tabs.find((t) => t.id === tabId) ?? section.tabs[0];
  if (!tab) return null;
  const content =
    tab.kind === "view" ? (
      <CollectionView key={`${tab.collection}-${tab.view}`} id={tab.collection} viewId={tab.view} />
    ) : (
      PAGES[tab.page](rest)
    );
  if (section.id === "home") return content;
  const tabs = visibleTabs(section);
  return (
    <>
      <header style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span className="ico" style={{ background: "#11141a", color: section.color }}>
          <Icon name={section.icon} size={20} />
        </span>
        <h1 style={{ margin: 0, fontSize: 32, letterSpacing: "-0.03em" }}>{section.label}</h1>
      </header>
      {tabs.length > 1 && (
        <nav aria-label={`${section.label} tabs`} className="section-tabs">
          {tabs.map((t) => (
            <a
              key={t.id}
              href={tabPath(section, t)}
              aria-current={t.id === tab.id ? "page" : undefined}
            >
              {t.label}
            </a>
          ))}
        </nav>
      )}
      {content}
    </>
  );
}
