import { gitIn } from "./git.ts";
import { syncRepo } from "./sync.ts";

// Run by the SessionStart hook: whatever happens, the session starts.
try {
  for (const line of syncRepo(gitIn(process.cwd()))) console.log(line);
} catch (error) {
  console.log(`sync: skipped (${error instanceof Error ? error.message : String(error)})`);
}
process.exit(0);
