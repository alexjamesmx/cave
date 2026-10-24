import { useEffect, useMemo, useRef, useState } from "react";
import { summarize, summaryLine } from "../../../shared/project-status.ts";
import { linkedTo, PARTS, templatesOf } from "../../../shared/projects.ts";
import { parseSteps, RUNS } from "../../../shared/runs.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { useNow, useToday } from "../app/hooks.ts";
import { navigate, projectPath } from "../app/router.ts";
import { titleOf } from "../logic/views.ts";
import { useAllItems, useDoc } from "../store/queries.ts";
import { type Colours, drawScene, TOKENS, ZOOM_MS } from "./draw.ts";
import { domOrder, hit, layout, type SceneInput, type SceneNode } from "./layout.ts";

const PHONE = "(max-width: 767px)";
const REDUCED = "(prefers-reduced-motion: reduce)";
const ON_SCENE = new Set(["active", "paused"]);

const text = (v: unknown) => (typeof v === "string" ? v : "");

/** The newest run's summary (or its last step), first line, for the hover tip. */
function latestReport(runs: Doc[]): string {
  const newest = [...runs].sort((a, b) =>
    text(b.data._created).localeCompare(text(a.data._created)),
  )[0];
  if (!newest) return "";
  const body = text(newest.data._body).split("\n")[0]?.trim();
  if (body) return body;
  const steps = parseSteps(newest.data.steps);
  return steps.ok ? (steps.steps.at(-1)?.title ?? "") : "";
}

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatches(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return matches;
}

/** Palette tokens as colours, read from the stylesheet once; the canvas cannot use `var()`. */
function readColours(): Colours {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    TOKENS.map((t) => [t, style.getPropertyValue(`--${t}`).trim()]),
  ) as Colours;
}

/**
 * The Scene (M11 part 5): you in the middle, every active or paused project an orb around you.
 * Size is activity this week, colour is status, a ring means an agent is on it. The canvas
 * redraws only while it is on screen and motion is on; the same orbs are hidden links in DOM
 * order by status, so the keyboard and screen readers get the list.
 */
export function Scene() {
  const { db } = useCave().local;
  const all = useAllItems(db);
  const settings = useDoc(db, "settings");
  const today = useToday();
  const now = useNow().getTime();
  const compact = useMedia(PHONE);
  const reduced = useMedia(REDUCED);
  const motion = settings?.data.motion === "system" ? !reduced : true;

  const { inputs, reports } = useMemo(() => {
    const items = all ?? [];
    const itemsOf = (c: string) => items.filter((d) => d.collection === c);
    const templates = templatesOf(settings?.data);
    const inputs: SceneInput[] = [];
    const reports: Record<string, string> = {};
    for (const p of itemsOf("projects")) {
      if (p.data._deleted === true || !ON_SCENE.has(text(p.data.status))) continue;
      const linked = (c: string) => linkedTo(itemsOf(c), p.id);
      const runs = linked(RUNS);
      const s = summarize(
        {
          project: p,
          parts: linked(PARTS),
          tasks: linked("tasks"),
          runs,
          others: [...linked("notes"), ...linked("ideas")],
        },
        templates[text(p.data.template)]?.progress,
        linked,
        today,
        now,
      );
      inputs.push({
        id: p.id,
        title: titleOf(p),
        line: summaryLine(s),
        state: s.state,
        activity: s.activity,
        agent: s.agentOnIt,
      });
      reports[p.id] = latestReport(runs);
    }
    return { inputs, reports };
  }, [all, settings, today, now]);

  const name = text(settings?.data.ownerName) || "You";
  const goal = text(settings?.data.goal);

  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [onScreen, setOnScreen] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== "hidden");
  const [hover, setHover] = useState<string>();
  const [zoom, setZoom] = useState<{ id: string; at: number }>();
  const colours = useMemo(readColours, []);
  const font = useMemo(() => getComputedStyle(document.body).fontFamily, []);

  const nodes = useMemo(
    () => (size.width > 0 ? layout(inputs, size.width, size.height, { compact }) : []),
    [inputs, size, compact],
  );

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
    });
    ro.observe(el);
    // Nothing is drawn until the canvas is on screen.
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry?.isIntersecting ?? false));
    io.observe(el);
    const onVisibility = () => setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // One frame on every change; a loop only while on screen, with motion on, or during a zoom.
  const animate = onScreen && pageVisible && (motion || zoom !== undefined);
  useEffect(() => {
    const el = canvas.current;
    if (!el || !onScreen || size.width === 0) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(size.width * dpr);
    el.height = Math.round(size.height * dpr);
    let frame = 0;
    const draw = (t: number) => {
      const progress = zoom ? Math.min((t - zoom.at) / ZOOM_MS, 1) : 0;
      drawScene(ctx, {
        width: size.width,
        height: size.height,
        dpr,
        t,
        nodes,
        centre: { name, goal },
        reports,
        hover,
        zoom: zoom ? { id: zoom.id, progress } : undefined,
        motion,
        compact,
        colours,
        font,
      });
      if (zoom && progress >= 1) {
        navigate(projectPath(zoom.id));
        return;
      }
      if (animate) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [
    onScreen,
    size,
    nodes,
    name,
    goal,
    reports,
    hover,
    zoom,
    motion,
    compact,
    colours,
    font,
    animate,
  ]);

  const at = (e: React.PointerEvent<HTMLCanvasElement>): SceneNode | undefined => {
    const rect = e.currentTarget.getBoundingClientRect();
    return hit(nodes, e.clientX - rect.left, e.clientY - rect.top);
  };
  const enter = (n: SceneNode) => {
    if (motion) setZoom({ id: n.id, at: performance.now() });
    else navigate(projectPath(n.id));
  };

  return (
    <div ref={wrap} className="scene-wrap">
      <canvas
        ref={canvas}
        className={`scene-canvas${hover ? " hot" : ""}`}
        onPointerMove={(e) => setHover(at(e)?.id)}
        onPointerLeave={() => setHover(undefined)}
        onClick={(e) => {
          const n = at(e as unknown as React.PointerEvent<HTMLCanvasElement>);
          if (n && !zoom) enter(n);
        }}
      />
      {inputs.length === 0 && (
        <p className="scene-empty muted">
          No projects yet. Start one under All, or promote an idea.
        </p>
      )}
      <ul className="sr scene-links" aria-label="Projects in the Scene">
        {domOrder(nodes).map((n) => (
          <li key={n.id}>
            <a href={projectPath(n.id)} data-x={Math.round(n.x)} data-y={Math.round(n.y)}>
              {n.title} · {n.line}
            </a>
          </li>
        ))}
      </ul>
      <p className="scene-legend">
        size = activity this week · colour = status · ring = an agent is on it · click to enter
      </p>
    </div>
  );
}
