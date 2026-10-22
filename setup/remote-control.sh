#!/usr/bin/env bash
# Keeps the laptop reachable from the Claude app's Code tab, as the session named below. Runs in
# WSL, started at logon by the "Cave Remote Control" task (setup/remote-control-task.ps1).
# same-dir and capacity 1 give the phone this real checkout (.env, data/, MCP config) with one
# session at a time. No permission flag is passed here; the project's deny rules on .env and data/
# still apply. remote-control exits after about 10 minutes offline, so the loop starts it again.
set -u
cd "$(dirname "$0")/.."
name="cave · laptop"
log_dir="${XDG_STATE_HOME:-$HOME/.local/state}/cave"
log="$log_dir/remote-control.log"
mkdir -p "$log_dir"

write_log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >>"$log"; }

# wsl.exe starts a non-login shell, so neither profile adds claude's or Bun's install folder.
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"
# Nor does it import systemd's user environment: point ssh (deploy, pull-data) at the user agent.
export SSH_AUTH_SOCK="${SSH_AUTH_SOCK:-${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/openssh_agent}"
while true; do
  if ! command -v claude >/dev/null; then
    write_log "claude not found on PATH; retrying in 30 s"
  else
    write_log "starting remote-control"
    claude remote-control --name "$name" --spawn same-dir --capacity 1
    write_log "remote-control exited with $?; restarting in 30 s"
  fi
  sleep 30
done
