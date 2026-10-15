/**
 * Flow text may use only `{{item.title}}`, `{{item.<field>}}`, `{{item.<field>|pct:N}}` (N
 * percent of a number, rounded to cents), `{{today}}` and `{{month}}`. Anything else in
 * braces is an error, and a missing field renders as empty.
 */

const TOKEN_RE = /\{\{([^{}]*)\}\}/g;
const ALLOWED_RE =
  /^(item\.title|item\.[A-Za-z_][A-Za-z0-9_]{0,63}(\|pct:\d{1,3}(\.\d{1,2})?)?|today|month)$/;

export function templateErrors(text: string): string[] {
  const errors: string[] = [];
  for (const match of text.matchAll(TOKEN_RE)) {
    const token = (match[1] ?? "").trim();
    if (!ALLOWED_RE.test(token) || token.startsWith("item.title|"))
      errors.push(`unknown template {{${token}}}`);
  }
  const stray = text.replace(TOKEN_RE, "");
  if (stray.includes("{{") || stray.includes("}}")) errors.push("unmatched braces in a template");
  return errors;
}

export interface TemplateContext {
  item?: Record<string, unknown>;
  /** Local `YYYY-MM-DD` and `YYYY-MM` in the settings timezone. */
  today: string;
  month: string;
}

const cents = (n: number) => {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
};

export function renderTemplate(text: string, ctx: TemplateContext): string {
  return text.replace(TOKEN_RE, (_, raw: string) => {
    const token = raw.trim();
    if (token === "today") return ctx.today;
    if (token === "month") return ctx.month;
    const [path = "", pipe] = token.split("|");
    const key = path === "item.title" ? "_title" : path.slice("item.".length);
    const value = ctx.item?.[key];
    if (pipe?.startsWith("pct:")) {
      const n = typeof value === "number" ? value : Number.NaN;
      return Number.isFinite(n) ? cents((n * Number(pipe.slice(4))) / 100) : "";
    }
    return value === undefined || value === null ? "" : String(value);
  });
}
