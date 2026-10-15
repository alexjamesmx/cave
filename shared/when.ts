import { localDateTime } from "./dates.ts";
import { dueInstant, nextDue, type Repeat, type Zone } from "./reminders.ts";

/**
 * Deterministic `remind <text> <when>` parsing, English and Spanish. Used by the command bar
 * and, later, by the Telegram `/remind` command. It never guesses: a "when" it can't place
 * stays in the title, and an entry without a date, or in the past, is refused with a hint.
 */

export interface WhenContext {
  now: Date;
  timeZone: string;
  /** `settings.reminderTime`, used for a date without a time. */
  reminderTime: string;
}

export type Parsed =
  | {
      ok: true;
      title: string;
      /** Local `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm` when a time was given. */
      due: string;
      repeat: Repeat;
      /** No time was given: the reminder time applies. */
      timeDefaulted: boolean;
    }
  | { ok: false; hint: string };

interface Ymd {
  y: number;
  mo: number;
  d: number;
}

interface State {
  date?: Ymd;
  /** A weekday (0 = Sunday); `strict` (next …) never means today. */
  weekday?: { dow: number; strict: boolean };
  time?: { h: number; mi: number };
  /** `in N …`: minutes, or whole days when the unit was days or weeks. */
  rel?: { minutes: number; days?: number };
  repeat?: Repeat;
}

// biome-ignore format: a lookup table reads best packed
const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, dom: 0, domingo: 0,
  mon: 1, monday: 1, lun: 1, lunes: 1,
  tue: 2, tues: 2, tuesday: 2, mar: 2, martes: 2,
  wed: 3, wednesday: 3, mie: 3, miercoles: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, jue: 4, jueves: 4,
  fri: 5, friday: 5, vie: 5, viernes: 5,
  sat: 6, saturday: 6, sab: 6, sabado: 6,
};

// biome-ignore format: a lookup table reads best packed
const MONTHS: Record<string, number> = {
  jan: 1, january: 1, ene: 1, enero: 1,
  feb: 2, february: 2, febrero: 2,
  mar: 3, march: 3, marzo: 3,
  apr: 4, april: 4, abr: 4, abril: 4,
  may: 5, mayo: 5,
  jun: 6, june: 6, junio: 6,
  jul: 7, july: 7, julio: 7,
  aug: 8, august: 8, ago: 8, agosto: 8,
  sep: 9, sept: 9, september: 9, set: 9, septiembre: 9, setiembre: 9,
  oct: 10, october: 10, octubre: 10,
  nov: 11, november: 11, noviembre: 11,
  dec: 12, december: 12, dic: 12, diciembre: 12,
};

// biome-ignore format: a lookup table reads best packed
const UNITS: Record<string, "min" | "h" | "d" | "w"> = {
  m: "min", min: "min", mins: "min", minute: "min", minutes: "min", minuto: "min", minutos: "min",
  h: "h", hr: "h", hrs: "h", hour: "h", hours: "h", hora: "h", horas: "h",
  d: "d", day: "d", days: "d", dia: "d", dias: "d",
  w: "w", wk: "w", week: "w", weeks: "w", semana: "w", semanas: "w",
};

// biome-ignore format: a lookup table reads best packed
const REPEAT_UNITS: Record<string, Repeat> = {
  day: "daily", dia: "daily", week: "weekly", semana: "weekly",
  month: "monthly", mes: "monthly", year: "yearly", ano: "yearly",
};

// biome-ignore format: a lookup table reads best packed
const REPEAT_WORDS: Record<string, Repeat> = {
  daily: "daily", diario: "daily", weekly: "weekly", semanal: "weekly",
  monthly: "monthly", mensual: "monthly", yearly: "yearly", anual: "yearly",
};

const EVERY = new Set(["every", "cada"]);
const NEXT = new Set(["next", "proximo", "siguiente"]);
const THIS = new Set(["this", "el", "este", "on"]);
const AT = new Set(["at", "a", "las", "la", "@"]);

// Lower case, accents dropped (mañana → manana), trailing punctuation dropped.
const norm = (token: string) =>
  token
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[,.;!?]+$/, "");

const TIME_RE = /^(\d{1,2})(?::(\d{2}))?(am|pm|a\.?m|p\.?m)?$/;

function readTime(token: string, ampm?: string): State["time"] | undefined {
  const m = TIME_RE.exec(token);
  if (!m) return undefined;
  const suffix = (m[3] ?? ampm ?? "").replaceAll(".", "");
  let h = Number(m[1]);
  const mi = Number(m[2] ?? 0);
  if (mi > 59) return undefined;
  if (suffix) {
    if (h < 1 || h > 12) return undefined;
    if (suffix === "pm" && h !== 12) h += 12;
    if (suffix === "am" && h === 12) h = 0;
  } else if (h > 23) return undefined;
  return { h, mi };
}

const dayNumber = (token: string) => {
  const m = /^(\d{1,2})(st|nd|rd|th|o)?$/.exec(token);
  const d = m ? Number(m[1]) : Number.NaN;
  return d >= 1 && d <= 31 ? d : undefined;
};
const yearNumber = (token: string) => (/^\d{4}$/.test(token) ? Number(token) : undefined);

type Apply = (s: State, ctx: Ctx) => boolean;
interface Ctx extends WhenContext {
  today: Ymd;
  /** The token just matched is the last one of the whole entry. */
  atEnd: boolean;
}

const set = <K extends keyof State>(s: State, key: K, value: State[K]) => {
  if (s[key] !== undefined) return false;
  s[key] = value;
  return true;
};

const daysIn = (y: number, mo: number) => new Date(Date.UTC(y, mo, 0)).getUTCDate();
const addDays = ({ y, mo, d }: Ymd, n: number): Ymd => {
  const t = new Date(Date.UTC(y, mo - 1, d + n));
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() };
};
const dowOf = ({ y, mo, d }: Ymd) => new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
const before = (a: Ymd, b: Ymd) => a.y * 10000 + a.mo * 100 + a.d < b.y * 10000 + b.mo * 100 + b.d;

/** A day and month with no year: this year, or next year once it has passed. */
function dated(d: number, mo: number, y: number | undefined, today: Ymd): Ymd | undefined {
  let year = y ?? today.y;
  if (y === undefined && before({ y: year, mo, d }, today)) year += 1;
  return d <= daysIn(year, mo) ? { y: year, mo, d } : undefined;
}

// Each matcher reads a whole slice of tokens (already normalised) or returns undefined.
type Matcher = (t: string[]) => Apply | undefined;

const MATCHERS: Matcher[] = [
  // in 2h · in 30 min · en 3 dias
  (t) => {
    if (!(t[0] === "in" || t[0] === "en")) return undefined;
    const compact = t.length === 2 ? /^(\d+)([a-z]+)$/.exec(t[1] as string) : null;
    const [n, unitWord] = compact
      ? [Number(compact[1]), compact[2] as string]
      : t.length === 3 && /^\d+$/.test(t[1] as string)
        ? [Number(t[1]), t[2] as string]
        : [Number.NaN, ""];
    const unit = UNITS[unitWord];
    if (!unit || !(n > 0)) return undefined;
    const minutes = n * { min: 1, h: 60, d: 1440, w: 10080 }[unit];
    const days = unit === "d" ? n : unit === "w" ? 7 * n : undefined;
    return (s) => set(s, "rel", { minutes, ...(days ? { days } : {}) });
  },
  // every day · cada mes 22 · every month on the 22nd · every monday · cada semana lunes
  (t) => {
    if (!EVERY.has(t[0] as string)) return undefined;
    const rest = t.slice(1).filter((w) => !THIS.has(w) && w !== "the" && w !== "de");
    const unit = REPEAT_UNITS[rest[0] ?? ""];
    const lone = WEEKDAYS[rest[0] ?? ""];
    if (rest.length === 1 && unit) return (s) => set(s, "repeat", unit);
    if (rest.length === 1 && lone !== undefined)
      return (s) => set(s, "repeat", "weekly") && set(s, "weekday", { dow: lone, strict: false });
    if (rest.length !== 2 || !unit) return undefined;
    const dow = WEEKDAYS[rest[1] as string];
    if (unit === "weekly" && dow !== undefined)
      return (s) => set(s, "repeat", unit) && set(s, "weekday", { dow, strict: false });
    const d = dayNumber(rest[1] as string);
    if (unit !== "monthly" || d === undefined) return undefined;
    return (s, ctx) => {
      // The first 22nd from today; a day a month lacks (31) waits for a month that has it.
      for (let k = 0; k < 13; k++) {
        const index = ctx.today.y * 12 + ctx.today.mo - 1 + k;
        const y = Math.floor(index / 12);
        const mo = (index % 12) + 1;
        if (d > daysIn(y, mo) || before({ y, mo, d }, ctx.today)) continue;
        return set(s, "repeat", unit) && set(s, "date", { y, mo, d });
      }
      return false;
    };
  },
  (t) => {
    const repeat = t.length === 1 ? REPEAT_WORDS[t[0] as string] : undefined;
    return repeat ? (s) => set(s, "repeat", repeat) : undefined;
  },
  // 2026-10-22
  (t) => {
    const m = t.length === 1 ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(t[0] as string) : null;
    if (!m) return undefined;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return undefined;
    return (s) => set(s, "date", { y, mo, d });
  },
  // 22 oct · oct 22 · 22 de octubre · 22 oct 2027 · 22 de octubre de 2027
  (t) => {
    const w = t.filter((x) => x !== "de");
    if (w.length < 2 || w.length > 3) return undefined;
    const year = w.length === 3 ? yearNumber(w[2] as string) : undefined;
    if (w.length === 3 && year === undefined) return undefined;
    const dm = [dayNumber(w[0] as string), MONTHS[w[1] as string]] as const;
    const md = [dayNumber(w[1] as string), MONTHS[w[0] as string]] as const;
    const [d, mo] = dm[0] !== undefined && dm[1] ? dm : md;
    if (d === undefined || !mo) return undefined;
    return (s, ctx) => {
      const date = dated(d, mo, year, ctx.today);
      return date !== undefined && set(s, "date", date);
    };
  },
  (t) => {
    const word = t.join(" ");
    const shift = { today: 0, hoy: 0, tomorrow: 1, manana: 1, "pasado manana": 2 }[word];
    return shift === undefined ? undefined : (s, ctx) => set(s, "date", addDays(ctx.today, shift));
  },
  // fri · next friday · el viernes · proximo viernes
  (t) => {
    const last = t.at(-1) as string;
    const dow = WEEKDAYS[last];
    if (dow === undefined) return undefined;
    const lead = t.slice(0, -1);
    const strict = lead.some((w) => NEXT.has(w));
    if (!lead.every((w) => NEXT.has(w) || THIS.has(w)) || lead.length > 2) return undefined;
    return (s) => set(s, "weekday", { dow, strict });
  },
  // 9am · 9:30 pm · 21:30 · at 9 · a las 18:00
  (t) => {
    const lead = t.filter((w) => AT.has(w));
    const rest = t.filter((w) => !AT.has(w));
    if (rest.length < 1 || rest.length > 2) return undefined;
    if (t.findIndex((w) => !AT.has(w)) !== lead.length) return undefined;
    const ampm = rest[1];
    if (ampm !== undefined && !/^(am|pm|a\.?m\.?|p\.?m\.?)$/.test(ampm)) return undefined;
    const token = rest[0] as string;
    const time = readTime(token, ampm);
    if (!time) return undefined;
    // A bare number is a time only after "at", with am/pm, or as the very last word: "buy
    // 2 tomorrow" keeps its 2.
    const bare = /^\d{1,2}$/.test(token) && ampm === undefined && lead.length === 0;
    return (s, ctx) => (!bare || ctx.atEnd) && set(s, "time", time);
  },
];

const MAX_SLICE = 5;

/** Consumes "when" expressions from one end of `tokens` until nothing more matches. */
function consume(
  raw: string[],
  tokens: string[],
  s: State,
  ctx: WhenContext & { today: Ymd },
  fromEnd: boolean,
) {
  let first = true;
  for (;;) {
    let matched = false;
    for (let n = Math.min(MAX_SLICE, tokens.length); n >= 1 && !matched; n--) {
      const slice = fromEnd ? tokens.slice(-n) : tokens.slice(0, n);
      for (const matcher of MATCHERS) {
        const apply = matcher(slice);
        const trial = { ...s };
        if (apply?.(trial, { ...ctx, atEnd: fromEnd && first })) {
          Object.assign(s, trial);
          if (fromEnd) {
            tokens.splice(-n);
            raw.splice(-n);
          } else {
            tokens.splice(0, n);
            raw.splice(0, n);
          }
          matched = true;
          break;
        }
      }
    }
    if (!matched) return;
    first = false;
  }
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = ({ y, mo, d }: Ymd) => `${y}-${pad(mo)}-${pad(d)}`;

function todayOf(now: Date, timeZone: string): Ymd {
  const [y, mo, d] = localDateTime(now, timeZone).slice(0, 10).split("-").map(Number);
  return { y: y as number, mo: mo as number, d: d as number };
}

const NO_DATE = "Add when: “tomorrow 9am”, “fri 18:00”, “22 oct”, “in 2h” or “every month 22”.";

/** Parses the text after `remind`. */
export function parseReminder(text: string, ctx: WhenContext): Parsed {
  const raw = text.trim().split(/\s+/).filter(Boolean);
  const tokens = raw.map(norm);
  const today = todayOf(ctx.now, ctx.timeZone);
  const s: State = {};
  const scan = { ...ctx, today };
  consume(raw, tokens, s, scan, true);
  consume(raw, tokens, s, scan, false);

  // "remind me to call mom" reads as "call mom".
  while (raw.length > 0 && ["me", "to", "que", "de"].includes(norm(raw[0] as string))) raw.shift();
  const words = raw.join(" ").replace(/^[-:–—]+\s*|\s*[-:–—]+$/g, "");
  if (!words) return { ok: false, hint: "What should I remind you about?" };
  const title = words.charAt(0).toUpperCase() + words.slice(1);

  const zone: Zone = { timeZone: ctx.timeZone, defaultTime: ctx.reminderTime };
  const now = ctx.now.getTime();
  const repeat: Repeat = s.repeat ?? "none";
  const at = (date: Ymd) =>
    s.time ? `${ymd(date)}T${pad(s.time.h)}:${pad(s.time.mi)}` : ymd(date);
  const future = (date: Ymd) => (dueInstant(at(date), zone) ?? 0) > now;
  const done = (due: string): Parsed => ({
    ok: true,
    title,
    due,
    repeat,
    timeDefaulted: !due.includes("T"),
  });

  if (s.rel) {
    if (s.date || s.weekday || s.repeat) return { ok: false, hint: "Use “in …” on its own." };
    if (s.time) {
      if (!s.rel.days) return { ok: false, hint: "Use “in 2h” or a time, not both." };
      return done(at(addDays(today, s.rel.days)));
    }
    return done(localDateTime(new Date(now + s.rel.minutes * 60_000), ctx.timeZone));
  }
  if (s.date && s.weekday) return { ok: false, hint: "Give one day, not two." };
  if (s.date) {
    if (future(s.date)) return done(at(s.date));
    // A repeat whose first day is today but whose time has passed starts at its next one.
    const next = s.repeat ? nextDue(at(s.date), repeat, now, zone) : undefined;
    if (next) return done(next);
    return { ok: false, hint: `${at(s.date).replace("T", " ")} has already passed.` };
  }
  if (s.weekday) {
    const ahead = (s.weekday.dow - dowOf(today) + 7) % 7;
    const first = addDays(today, ahead === 0 && s.weekday.strict ? 7 : ahead);
    return done(at(future(first) ? first : addDays(first, 7)));
  }
  if (s.repeat) {
    // Starts today when today's time is still ahead; otherwise at the next occurrence.
    const next = nextDue(at(today), repeat, now, zone);
    return next ? done(next) : { ok: false, hint: NO_DATE };
  }
  if (s.time) return { ok: false, hint: "Add a day: “today 18:00” or “tomorrow 18:00”." };
  return { ok: false, hint: NO_DATE };
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "Reminder · Pay rent · Thu Oct 22, 09:00 · monthly", shown before anything is saved. */
export function preview(parsed: Extract<Parsed, { ok: true }>, ctx: WhenContext): string {
  const [y, mo, d] = parsed.due.slice(0, 10).split("-").map(Number) as [number, number, number];
  const dow = WEEKDAY_NAMES[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  const year = y === todayOf(ctx.now, ctx.timeZone).y ? "" : ` ${y}`;
  const time = parsed.timeDefaulted
    ? `${ctx.reminderTime} (reminder time)`
    : parsed.due.slice(11, 16);
  const repeat = parsed.repeat === "none" ? "" : ` · ${parsed.repeat}`;
  return `Reminder · ${parsed.title} · ${dow} ${MONTH_NAMES[mo - 1]} ${d}${year}, ${time}${repeat}`;
}
