#!/usr/bin/env bash
# One-time setup of an Ubuntu development machine, after the tools in docs/onboarding.md.
# Safe to run again: it keeps what is already there.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== Tools"
for tool in git bun claude; do
  command -v "$tool" >/dev/null || { echo "$tool is missing: see docs/onboarding.md" >&2; exit 1; }
  echo "$tool $("$tool" --version | head -n 1)"
done

echo "== Global Claude rules"
target="$HOME/.claude/CLAUDE.md"
mkdir -p "$HOME/.claude"
if [ -e "$target" ]; then
  cp setup/user-CLAUDE.md "$target.suggested"
  echo "Kept your $target. Suggested version: $target.suggested"
else
  cp setup/user-CLAUDE.md "$target"
  echo "Wrote $target"
fi

echo "== Playwright MCP (user scope)"
if claude mcp get playwright >/dev/null 2>&1; then
  echo "playwright already configured"
else
  claude mcp add --scope user playwright -- bunx @playwright/mcp@latest
fi

echo "== Plugins"
for plugin in superpowers feature-dev code-review commit-commands security-guidance skill-creator claude-md-management; do
  claude plugin install "$plugin@claude-plugins-official"
done

echo "== Repository"
git config core.hooksPath .githooks
bun install --frozen-lockfile

echo "== Laptop keys"
keys="$HOME/.config/environment.d/cave.conf"
if [ -e "$keys" ]; then
  echo "Kept your $keys"
else
  mkdir -p "$(dirname "$keys")"
  install -m 600 setup/cave.conf.example "$keys"
  echo "Wrote $keys: fill in the keys (docs/onboarding.md, Keys), then log out and back in"
fi

echo "== Remote Control (the phone's Code tab reaches this checkout)"
unit="$HOME/.config/systemd/user/cave-remote-control.service"
mkdir -p "$(dirname "$unit")"
sed "s|@ROOT@|$PWD|g" setup/cave-remote-control.service >"$unit"
systemctl --user daemon-reload
systemctl --user enable cave-remote-control.service
echo "It starts at your next login. Now: systemctl --user start cave-remote-control"

echo "Done. Run claude here, approve the project MCP servers, and check them with /mcp."
