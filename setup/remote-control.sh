#!/usr/bin/env bash
# Keeps the laptop reachable from the Claude app's Code tab, as the session named below. The
# systemd user unit cave-remote-control.service (setup/setup.sh installs it) starts it at login and
# again 30 s after it exits. same-dir and capacity 1 give the phone this real checkout (.env,
# data/, MCP config) with one session at a time. No permission flag is passed here; the project's
# deny rules on .env and data/ still apply.
set -eu
cd "$(dirname "$0")/.."
# systemd starts units without a login shell, so no profile adds claude's or Bun's install folder.
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"
# ssh (deploy, pull-data) uses the agent of openssh's ssh-agent.socket when the session has none.
export SSH_AUTH_SOCK="${SSH_AUTH_SOCK:-${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/ssh-agent.socket}"
exec claude remote-control --name "cave · laptop" --spawn same-dir --capacity 1
