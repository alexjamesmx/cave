import { type ReactNode, useMemo } from "react";
import { useCave } from "../app/context.ts";
import { projectPath } from "../app/router.ts";
import { type PageId, type Section, tabPath, visibleTabs } from "../app/sections.ts";
import { withActiveFields } from "../logic/field-edits.ts";
import { titleOf } from "../logic/views.ts";
import { useCollections, useItems } from "../store/queries.ts";
import { DueCard } from "../ui/DueCard.tsx";
import { Icon } from "../ui/icon.tsx";
import { ActivityPage } from "./Activity.tsx";
import { Agents } from "./Agents.tsx";
import { Calendar } from "./Calendar.tsx";
import { CollectionView } from "./CollectionPage.tsx";
import { Flows } from "./Flows.tsx";
import { SettingsLists } from "./Lists.tsx";
import { NotesPage } from "./Notes.tsx";
import { ProjectPage } from "./Project.tsx";
import { IdeasPage, ProjectsAll } from "./Projects.tsx";
import { RadarPage } from "./Radar.tsx";
import { ReviewCategories } from "./ReviewCategories.tsx";
import {
  SettingsData,
  SettingsDevices,
  SettingsGeneral,
  SettingsNotifications,
} from "./Settings.tsx";
import { System } from "./System.tsx";
import { Transactions } from "./Transactions.tsx";

/** Each page tab's component; \`rest\` is the path after the tab (a flow id, a collection). */
const PAGES: Record<PageId, (rest: string[]) => ReactNode> = {
  "calendar-month": () => <Calendar mode="month" />,
  "calendar-agenda": () => <Calendar mode="agenda" />,
  review: () => <ReviewCategories />,
  "money-transactions": () => <Transactions />,
  "projects-all": () => (
    <>
      <LandingDue />
      <ProjectsAll />
    </>
  ),
  "projects-ideas": () => <IdeasPage />,
  radar: () => <RadarPage />,
  notes: (rest) => <NotesPage {...(rest[0] ? { noteId: rest[0] } : {})} />,
  project: (rest) => <ProjectPage rest={rest} />,
  activity: () => <ActivityPage />,
  agents: () => <Agents />,
  flows: (rest) => <Flows id={rest[0]} />,
  "settings-general": () => <SettingsGeneral />,
  "settings-lists": () => <SettingsLists />,
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

/** What is due, on the screen the app opens on; the "needs you" strip (M11 part 4) replaces it. */
function LandingDue() {
  const stored = useCollections(useCave().local.db);
  const collections = useMemo(() => stored?.map(withActiveFields), [stored]);
  return collections ? <DueCard collections={collections} /> : null;
}
