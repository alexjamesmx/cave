import { STATE_TOKEN } from "../../../shared/project-status.ts";
import { angleOf, type SceneNode } from "./layout.ts";

/** Palette tokens resolved to colours once per mount (the canvas cannot read CSS variables). */
export const TOKENS = [
  "ok",
  "warn",
  "wait",
  "bad",
  "vio",
  "muted",
  "text",
  "line",
  "panel",
  "bg",
] as const;
export type Colours = Record<(typeof TOKENS)[number], string>;

export interface Frame {
  width: number;
  height: number;
  dpr: number;
  /** Milliseconds; drives the float, the turning ring and the zoom. */
  t: number;
  nodes: SceneNode[];
  centre: { name: string; goal: string };
  /** The newest report's first line per project, shown on hover. */
  reports: Record<string, string>;
  hover?: string | undefined;
  /** A click in flight: the orb grows and the rest fades for 300 ms, then the page changes. */
  zoom?: { id: string; progress: number } | undefined;
  motion: boolean;
  compact: boolean;
  colours: Colours;
  font: string;
}

export const ZOOM_MS = 300;
const TAU = Math.PI * 2;

/** The slow vertical float of an orb; still when motion is off. */
export function floatOf(n: SceneNode, t: number, motion: boolean): number {
  return motion ? Math.sin(t / 1400 + angleOf(n.id)) * 3 : 0;
}

const ellipsis = (ctx: CanvasRenderingContext2D, text: string, max: number) => {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
  return `${cut}…`;
};

/** One frame of the Scene, in CSS pixels; the canvas is scaled by `dpr` first. */
export function drawScene(ctx: CanvasRenderingContext2D, f: Frame): void {
  const { width: w, height: h, colours: c } = f;
  ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;

  // A faint glow behind the centre, as the mockup has it.
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.45);
  glow.addColorStop(0, `${c.vio}18`);
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const zoomed = f.zoom ? f.nodes.find((n) => n.id === f.zoom?.id) : undefined;
  const p = f.zoom?.progress ?? 0;
  if (zoomed) {
    // Everything else fades; the chosen orb grows towards the viewer.
    ctx.globalAlpha = 1 - p * 0.9;
  }

  // Edges from the centre to each orb.
  ctx.lineWidth = 1;
  for (const n of f.nodes) {
    const y = n.y + floatOf(n, f.t, f.motion);
    const grad = ctx.createLinearGradient(cx, cy, n.x, y);
    grad.addColorStop(0, `${c.text}00`);
    grad.addColorStop(0.5, `${c.text}2e`);
    grad.addColorStop(1, `${c.text}00`);
    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(n.x, y);
    ctx.stroke();
  }

  // The centre: the owner, and the goal under the name.
  ctx.fillStyle = c.vio;
  ctx.beginPath();
  ctx.arc(cx, cy, f.compact ? 18 : 23, 0, TAU);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = c.text;
  ctx.font = `600 ${f.compact ? 12 : 13}px ${f.font}`;
  ctx.fillText(f.centre.name, cx, cy + (f.compact ? 24 : 30));
  if (f.centre.goal) {
    ctx.fillStyle = c.muted;
    ctx.font = `${f.compact ? 10.5 : 11}px ${f.font}`;
    ctx.fillText(
      ellipsis(ctx, f.centre.goal, Math.min(w * 0.6, 320)),
      cx,
      cy + (f.compact ? 40 : 48),
    );
  }

  for (const n of f.nodes) {
    if (n.id === zoomed?.id) continue;
    drawOrb(ctx, f, n);
  }
  if (zoomed) {
    ctx.globalAlpha = 1;
    ctx.save();
    const y = zoomed.y + floatOf(zoomed, f.t, f.motion);
    const scale = 1 + p * 2.5;
    ctx.translate(zoomed.x, y);
    ctx.scale(scale, scale);
    ctx.translate(-zoomed.x, -y);
    drawOrb(ctx, f, zoomed);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawOrb(ctx: CanvasRenderingContext2D, f: Frame, n: SceneNode): void {
  const c = f.colours;
  const colour =
    (c as Record<string, string | undefined>)[STATE_TOKEN[n.state].slice(2)] ?? c.muted;
  const y = n.y + floatOf(n, f.t, f.motion);
  const hot = f.hover === n.id;
  ctx.save();
  ctx.globalAlpha *= n.opacity;

  if (hot) {
    ctx.strokeStyle = `${colour}80`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(n.x, y, n.radius + 5, 0, TAU);
    ctx.stroke();
  }
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(n.x, y, n.radius, 0, TAU);
  ctx.fill();
  // A thin inner rim gives the orb its edge on a dark panel.
  ctx.strokeStyle = `${c.text}14`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(n.x, y, n.radius - 0.5, 0, TAU);
  ctx.stroke();

  // An agent is on it: a dashed ring, turning slowly while motion is on.
  if (n.agent) {
    ctx.save();
    ctx.translate(n.x, y);
    ctx.rotate(f.motion ? (f.t / 14000) * TAU : 0);
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = `${c.text}55`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, n.radius + 7, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  ctx.textAlign = "center";
  if (f.compact) {
    // The label sits inside the orb on a phone.
    ctx.textBaseline = "middle";
    ctx.fillStyle = c.bg;
    ctx.font = `600 10px ${f.font}`;
    ctx.fillText(ellipsis(ctx, n.title, n.radius * 2 - 6), n.x, y);
  } else {
    ctx.textBaseline = "top";
    ctx.fillStyle = hot ? c.text : `${c.text}e6`;
    ctx.font = `600 12px ${f.font}`;
    ctx.fillText(ellipsis(ctx, n.title, 132), n.x, y + n.radius + 6);
    ctx.fillStyle = c.muted;
    ctx.font = `10.5px ${f.font}`;
    ctx.fillText(ellipsis(ctx, n.line, 140), n.x, y + n.radius + 21);
    const report = hot ? f.reports[n.id] : undefined;
    if (report) {
      ctx.fillStyle = c.text;
      ctx.font = `11px ${f.font}`;
      const text = ellipsis(ctx, report, 260);
      const tw = ctx.measureText(text).width + 16;
      const bx = Math.min(Math.max(n.x - tw / 2, 6), f.width - tw - 6);
      const by = y - n.radius - 32;
      ctx.fillStyle = c.panel;
      ctx.strokeStyle = c.line;
      ctx.beginPath();
      ctx.roundRect(bx, by, tw, 24, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = c.text;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(text, bx + 8, by + 12);
    }
  }
  ctx.restore();
}
