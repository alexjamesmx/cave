import type { ReactNode } from "react";
import { useCave } from "../app/context.ts";
import { projectPath } from "../app/router.ts";
import { type PageId, type Section, tabPath, visibleTabs } from "../app/sections.ts";
import { titleOf } from "../logic/views.ts";
import { Scene } from "../scene/Scene.tsx";
import { useItems } from "../store/queries.ts";
import { Icon } from "../ui/icon.tsx";
import { NeedsYou } from "../ui/NeedsYou.tsx";
import { ActivityPage } from "./Activity.tsx";
import { Calendar } from "./Calendar.tsx";
import { CollectionView } from "./CollectionPage.tsx";
import { DiaryDays } from "./DiaryDays.tsx";
import { DiaryToday } from "./DiaryToday.tsx";
import { FlowJob } from "./FlowJob.tsx";
import { FlowRuns } from "./FlowRuns.tsx";
import { Flows } from "./Flows.tsx";
import { MoneyLists } from "./MoneyLists.tsx";
import { Notes } from "./Notes.tsx";
import { ProjectPage } from "./Project.tsx";
import { IdeasPage, ProjectsAll } from "./Projects.tsx";
import { Reminders } from "./Reminders.tsx";
import { SettingsAgents } from "./settings/Agents.tsx";
import { SettingsData } from "./settings/Data.tsx";
import { SettingsDevices } from "./settings/Devices.tsx";
import { SettingsGeneral } from "./settings/General.tsx";
import { SettingsNotifications } from "./settings/Notifications.tsx";
import { TasksList } from "./TasksList.tsx";
import { Transactions } from "./Transactions.tsx";
import { Week } from "./Week.tsx";

/** Each page tab's component; \`rest\` is the path after the tab (a flow id, a collection). */
const PAGES: Record<PageId, (rest: string[]) => ReactNode> = {
  "calendar-month": () => <Calendar mode="month" />,
  "calendar-agenda": () => <Calendar mode="agenda" />,
  "calendar-week": () => <Week />,
  "calendar-reminders": () => <Reminders />,
  "money-transactions": () => <Transactions />,
  "money-lists": () => <MoneyLists />,
  "projects-scene": () => (
    <>
      <LandingNeedsYou />
      <Scene />
    </>
  ),
  "projects-all": () => (
    <>
      <LandingNeedsYou />
      <ProjectsAll />
    </>
  ),
  "projects-ideas": () => <IdeasPage />,
  notes: (rest) => <Notes id={rest[0]} />,
  "tasks-list": () => <TasksList />,
  "diary-today": () => <DiaryToday />,
  "diary-days": () => <DiaryDays />,
  project: (rest) => <ProjectPage rest={rest} />,
  activity: () => <ActivityPage />,
  flows: (rest) => (rest[0] === "jobs" ? <FlowJob id={rest[1]} /> : <Flows id={rest[0]} />),
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
  const pinned = usePinnedProjects();
  const tab = section.tabs.find((t) => t.id === tabId) ?? section.tabs[0];
  if (!tab) return null;
  const content =
    tab.kind === "view" ? (
      <CollectionView key={`${tab.collection}-${tab.view}`} id={tab.collection} viewId={tab.view} />
    ) : (
      PAGES[tab.page](rest)
    );
  const tabs = visibleTabs(section);
  // Pinned projects sit beside All and Ideas.
  const extra = section.id === "projects" ? (pinned ?? []) : [];
  return (
    <>
      <header style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span className="ico" style={{ background: "var(--on)", color: section.color }}>
          <Icon name={section.icon} size={18} />
        </span>
        <h1 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.02em" }}>{section.label}</h1>
      </header>
      {tabs.length + extra.length > 1 && (
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
          {extra.map((p) => (
            <a
              key={p.id}
              href={projectPath(p.id)}
              aria-current={tab.id === "project" && rest[0] === p.id ? "page" : undefined}
            >
              {titleOf(p)}
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

function usePinnedProjects() {
  const projects = useItems(useCave().local.db, "projects");
  return projects?.filter((p) => p.data.pinned === true);
}

/** What needs the owner, above the Scene and the All list. */
function LandingNeedsYou() {
  return <NeedsYou />;
}
