import { fieldsOf } from "../shared/fields.ts";
import { buildReview } from "../shared/money-review.ts";
import type { Doc } from "../shared/types.ts";

/**
 * `bun run money-review`: reads every money entry from the hosted server (`/api/export`),
 * builds one proposal per entry the rules would change, and stores them as the server's review
 * (`POST /api/money-review`). It changes no entry: the owner approves each change in the app.
 * `--local` reads the server on this machine instead; `--dry-run` only prints the counts.
 */

const local = process.argv.includes("--local");
const dryRun = process.argv.includes("--dry-run");
const base = local ? `http://127.0.0.1:${process.env.PORT ?? 3000}` : process.env.CAVE_REMOTE_URL;
const token = local ? process.env.CAVE_TOKEN : process.env.CAVE_REMOTE_TOKEN;
if (!base || (!local && !token)) {
  console.error(
    "Set CAVE_REMOTE_URL and CAVE_REMOTE_TOKEN (in the laptop's .env), or pass --local",
  );
  process.exit(1);
}
const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};

const exported = await fetch(new URL("/api/export", base), { headers });
if (!exported.ok) {
  console.error(`Reading the server failed: HTTP ${exported.status}`);
  process.exit(1);
}
const { docs } = (await exported.json()) as { docs: Doc[] };
const money = docs.find((d) => d.id === "money");
const options = fieldsOf(money).find((f) => f.id === "category")?.options ?? [];
const proposals = buildReview(docs, options);

const byRule = new Map<string, number>();
for (const p of proposals) byRule.set(p.rule, (byRule.get(p.rule) ?? 0) + 1);
const entries = docs.filter((d) => d.collection === "money" && d.data._deleted !== true).length;
console.log(`${entries} money entries read; ${proposals.length} proposals:`);
for (const [rule, n] of [...byRule].sort((a, b) => b[1] - a[1])) console.log(`  ${n}  ${rule}`);

if (dryRun) {
  console.log("Dry run: nothing stored.");
  process.exit(0);
}
const stored = await fetch(new URL("/api/money-review", base), {
  method: "POST",
  headers: { ...headers, "content-type": "application/json" },
  body: JSON.stringify({ proposals }),
});
if (!stored.ok) {
  console.error(`Storing the review failed: HTTP ${stored.status}`);
  process.exit(1);
}
const { kept, skipped } = (await stored.json()) as { kept: number; skipped: number };
console.log(
  `Stored ${kept} for review (${skipped} already decided). Approve them on the Review categories page: Money → Review categories.`,
);
