#!/bin/bash
# Setup script for the `cave` Claude Code cloud environment: paste it into the environment's
# Setup script field. It runs as root on Ubuntu 24.04 before Claude Code starts, and its result
# is cached, so it provisions the VM only. Sessions run `bun install` against the lockfile.
#
# The pinned Bun comes from npm: registry.npmjs.org is on the Trusted network list, bun.sh
# (the official installer's host) is not.
set -euo pipefail

BUN_VERSION=1.4.3

npm install --global --no-fund --no-audit "bun@$BUN_VERSION"
# The real binary, not npm's link to it: the links below must never point at themselves.
pinned=$(readlink -f "$(npm prefix --global)/bin/bun")
"$pinned" --version

# The VM ships its own Bun; every other bun on PATH becomes a link to the pinned one, so
# whichever directory comes first in the session's PATH, `bun` is the pinned version.
ln -sf "$pinned" /usr/local/bin/bun
while read -r other; do
  if [ "$(readlink -f "$other")" != "$pinned" ]; then ln -sf "$pinned" "$other"; fi
done < <(type -ap bun)

echo "bun $(bun --version) at $(command -v bun)"
[ "$(bun --version)" = "$BUN_VERSION" ]
