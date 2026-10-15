/** What the service worker passes to `showNotification`, read from a push payload. */
export interface Shown {
  title: string;
  options: {
    body?: string;
    tag?: string;
    actions?: { action: string; title: string }[];
    /** Where a click goes: the notification's own link, and one per action. */
    data: { navigate: string; actions: Record<string, string> };
  };
}

/** A link from a payload, kept to this origin: a notification never opens another site. */
function sameOrigin(value: unknown, origin: string): string | undefined {
  if (typeof value !== "string" || !URL.canParse(value, origin)) return undefined;
  const url = new URL(value, origin);
  return url.origin === origin ? url.href : undefined;
}

/**
 * The server sends Declarative Web Push (`{ web_push: 8030, notification }`). Safari 18.4+
 * shows that itself; every other browser hands it to the `push` event, which shows it here.
 */
export function fromPush(data: unknown, origin: string): Shown | undefined {
  const n = (data as { web_push?: unknown; notification?: Record<string, unknown> } | null)
    ?.notification;
  if (!n || typeof n.title !== "string") return undefined;
  const navigate = sameOrigin(n.navigate, origin) ?? `${origin}/`;
  const actions = Array.isArray(n.actions)
    ? (n.actions as { action?: unknown; title?: unknown; navigate?: unknown }[]).flatMap((a) => {
        const link = sameOrigin(a.navigate, origin);
        return typeof a.action === "string" && typeof a.title === "string" && link
          ? [{ action: a.action, title: a.title, link }]
          : [];
      })
    : [];
  return {
    title: n.title,
    options: {
      ...(typeof n.body === "string" ? { body: n.body } : {}),
      ...(typeof n.tag === "string" ? { tag: n.tag } : {}),
      ...(actions.length > 0
        ? { actions: actions.map(({ action, title }) => ({ action, title })) }
        : {}),
      data: { navigate, actions: Object.fromEntries(actions.map((a) => [a.action, a.link])) },
    },
  };
}

/** The page a click opens: the action's link when an action button was pressed. */
export function clickTarget(data: unknown, action: string): string | undefined {
  const d = data as Shown["options"]["data"] | undefined;
  if (!d || typeof d.navigate !== "string") return undefined;
  return (action && d.actions?.[action]) || d.navigate;
}
