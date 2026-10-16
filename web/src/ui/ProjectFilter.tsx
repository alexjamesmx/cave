import { useCave } from "../app/context.ts";
import { setSearch } from "../app/router.ts";
import { titleOf } from "../logic/views.ts";
import { useItems } from "../store/queries.ts";

/** `?project=<id>` from a query string; kept in the URL so a filtered list can be bookmarked. */
export function projectFilterOf(search: string): string | undefined {
  return new URLSearchParams(search).get("project") || undefined;
}

function withProject(search: string, project: string | undefined): string {
  const params = new URLSearchParams(search);
  if (project) params.set("project", project);
  else params.delete("project");
  const next = params.toString();
  return next ? `?${next}` : "";
}

/** Narrows a list to one project's items. */
export function ProjectFilter({ value }: { value: string | undefined }) {
  const projects = useItems(useCave().local.db, "projects");
  if (!projects || projects.length === 0) return null;
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
      <span className="muted">Project</span>
      <select
        className="input"
        style={{ width: "auto" }}
        value={value ?? ""}
        onChange={(e) => setSearch(withProject(location.search, e.target.value || undefined))}
      >
        <option value="">All</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {titleOf(p)}
          </option>
        ))}
      </select>
    </label>
  );
}
