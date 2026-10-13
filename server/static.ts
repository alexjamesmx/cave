import { join } from "node:path";

const WEB = join(import.meta.dir, "..", "web");

// A fixed list: nothing outside these files is reachable through the static routes.
const ICONS: Record<string, string> = {
  "icon.svg": "image/svg+xml",
  "icon-192.png": "image/png",
  "icon-512.png": "image/png",
  "icon-maskable-512.png": "image/png",
};

const file = (path: string, type: string) =>
  new Response(Bun.file(path), { headers: { "content-type": type } });

/** Icons at stable paths, for the manifest (Bun bundles the manifest itself from index.html). */
export const staticRoutes = {
  "/icons/:name": {
    GET: (req: Request & { params: { name: string } }) => {
      const type = ICONS[req.params.name];
      if (!type) return Response.json({ error: "not found" }, { status: 404 });
      return file(join(WEB, "icons", req.params.name), type);
    },
  },
};
