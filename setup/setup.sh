#!/usr/bin/env bash
# One-time setup of a Linux development machine, after the tools in docs/system.md section 6.
# Safe to run again: it keeps what is already there. On WSL it also registers Remote Control.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== Tools"
for tool in git bun claude; do
  command -v "$tool" >/dev/null || { echo "$tool is missing: see docs/system.md section 6" >&2; exit 1; }
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
  # bunx, not npx: on WSL the npx on PATH can be the Windows one.
  claude mcp add --scope user playwright -- bunx @playwright/mcp@latest
fi

echo "== Plugins"
for plugin in superpowers feature-dev code-review commit-commands security-guidance skill-creator claude-md-management; do
  claude plugin install "$plugin@claude-plugins-official"
done

echo "== Repository"
git config core.hooksPath .githooks
bun install --frozen-lockfile

if [ -n "${WSL_DISTRO_NAME:-}" ]; then
  echo "== Remote Control (the phone's Code tab reaches this checkout)"
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w setup/remote-control-task.ps1)"
fi

echo "Done. Run claude here, approve the project MCP servers, and check them with /mcp."
