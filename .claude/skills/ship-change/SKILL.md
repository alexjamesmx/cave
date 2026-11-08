---
name: ship-change
description: Verify, commit and push one change to the Cave repo. Use after editing code or docs here, before saying a change is done.
---

# Ship a change

1. **Verify** with failures visible (`set -o pipefail`; never trust a piped `| tail`):
   ```bash
   set -o pipefail
   bunx biome check --write . >/dev/null; bun run check && bun test
   ```
   UI touched: `bun run e2e` on the specs involved. A page region removed or renamed: the full `bun run e2e`. Run e2e in the background; it takes minutes.
2. **Fix, don't silence.** A spec that fails because of a race (navigating before a write lands) waits for the write's visible result; it never gains a sleep.
3. **Commit** one human-readable line, no attribution: `git add -A && git commit -m "<what changed for the owner>"`. Never stage `data/`, `.env*` or scratch scripts.
4. **Push** `git push origin main`, unless AGENTS.md "Shipping" says the change needs a branch and PR.
5. **Report** what changed, what was verified with which command, and what wasn't.
