// Renders the PWA's PNG icons from web/icons/icon.svg. Run once after changing the SVG:
//   bun scripts/render-icons.ts
// The PNGs are committed; the app never renders icons at run time.
import { join } from "node:path";
import { chromium } from "@playwright/test";

const dir = join(import.meta.dir, "..", "web", "icons");
const svg = await Bun.file(join(dir, "icon.svg")).text();
const outputs = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  // The mark already sits inside the 80% safe zone, so the maskable icon is the same image.
  { file: "icon-maskable-512.png", size: 512 },
];

const browser = await chromium.launch({ channel: process.env.CAVE_E2E_CHANNEL ?? "msedge" });
try {
  for (const { file, size } of outputs) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<html><body style="margin:0"><div style="width:${size}px;height:${size}px">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</div></body></html>`,
    );
    await page.screenshot({
      path: join(dir, file),
      clip: { x: 0, y: 0, width: size, height: size },
    });
    await page.close();
    console.log(`wrote web/icons/${file}`);
  }
} finally {
  await browser.close();
}
