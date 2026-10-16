import { parseSeedArgs, seedDatabase } from "./sample-db.ts";

const args = parseSeedArgs(process.argv.slice(2));
if (!args.ok) {
  console.error(`${args.error}\nUsage: bun run seed [--db <path>] [--reset]`);
  process.exit(1);
}
const result = seedDatabase(args.value, process.env, Date.now());
if (!result.ok) {
  console.error(`Not seeded: ${result.error}`);
  process.exit(1);
}
console.log(`Seeded ${result.path}: ${result.docs} docs, dated from ${result.today}`);
