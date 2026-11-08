import type { ReactNode } from "react";
import { type PageId, type Section, tabPath, visibleTabs } from "../app/sections.ts";
import { Icon } from "../ui/icon.tsx";
import { Calendar } from "./Calendar.tsx";
import { CollectionView } from "./CollectionPage.tsx";
import { DiaryDays } from "./DiaryDays.tsx";
import { DiaryToday } from "./DiaryToday.tsx";
import { FlowRuns } from "./FlowRuns.tsx";
import { Flows } from "./Flows.tsx";
import { IdeasPage } from "./Ideas.tsx";
import { MoneyLists } from "./MoneyLists.tsx";
import { Notes } from "./Notes.tsx";
import { Reminders } from "./Reminders.tsx";
import { Routine } from "./Routine.tsx";
import { Subscriptions } from "./Subscriptions.tsx";
import { SettingsAgents } from "./settings/Agents.tsx";
import { SettingsData } from "./settings/Data.tsx";
import { SettingsDevices } from "./settings/Devices.tsx";
import { SettingsGeneral } from "./settings/General.tsx";
import { SettingsNotifications } from "./settings/Notifications.tsx";
import { TasksList } from "./TasksList.tsx";
import { Transactions } from "./Transactions.tsx";

/** Each page tab's component; \`rest\` is the path after the tab (a flow id, a collection). */
const PAGES: Record<PageId, (rest: string[]) => ReactNode> = {
  "calendar-month": () => <Calendar />,
  "calendar-reminders": () => <Reminders />,
  "calendar-routine": () => <Routine />,
  "money-transactions": () => <Transactions />,
  "money-lists": () => <MoneyLists />,
  "money-subscriptions": () => <Subscriptions />,
  ideas: () => <IdeasPage />,
  notes: (rest) => <Notes id={rest[0]} />,
  "tasks-list": () => <TasksList />,
  "diary-today": () => <DiaryToday />,
  "diary-days": () => <DiaryDays />,
  flows: (rest) => <Flows rest={rest} />,
  "flows-runs": () => <FlowRuns />,
  "settings-general": () => <SettingsGeneral />,
  "settings-devices": (rest) => <SettingsDevices tab={rest[0]} />,
  "settings-notifications": () => <SettingsNotifications />,
  "settings-agents": () => <SettingsAgents />,
  "settings-data": (rest) => <SettingsData rest={rest} />,
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
  const tabs = visibleTabs(section);
  return (
    <>
      <header style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span className="ico" style={{ background: "var(--on)", color: section.color }}>
          <Icon name={section.icon} size={18} />
        </span>
        <h1 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.02em" }}>{section.label}</h1>
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
      {tab.description && (
        <p className="muted tab-description" style={{ margin: 0 }}>
          {tab.description}
        </p>
      )}
      {content}
    </>
  );
}
