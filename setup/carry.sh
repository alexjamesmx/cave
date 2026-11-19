#!/usr/bin/env bash
# Moves what only the laptop holds to the next machine, as one gpg-encrypted file: the checkout's
# .env, data/ and .claude/settings.local.json; ~/.ssh; the keys file
# ~/.config/environment.d/cave.conf; Claude Code's user rules and settings, and its memory of this
# project (docs/onboarding.md, "Move to a new laptop").
#   setup/carry.sh pack <dir>     on the old machine: writes <dir>/cave-carry-<date>.tar.gpg
#   setup/carry.sh unpack <file>  on the new machine, in the new checkout, before setup/setup.sh
# gpg asks for the passphrase; CAVE_CARRY_PASSPHRASE_FILE supplies it instead (tests). unpack never
# overwrites: a file that is already there is kept and listed.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
keys_file="$HOME/.config/environment.d/cave.conf"
# Claude Code names a project's folder after its path, with every character but letters and digits
# as "-", so the memory follows the checkout to its new path.
memory="$HOME/.claude/projects/$(printf '%s' "$root" | tr -c 'A-Za-z0-9' '-')/memory"
keys=(CAVE_AGENT_TOKEN CONTEXT7_API_KEY EXA_API_KEY FIRECRAWL_API_KEY GITHUB_PAT)

gpg_args=(--quiet)
if [ -n "${CAVE_CARRY_PASSPHRASE_FILE:-}" ]; then
  gpg_args+=(--batch --pinentry-mode loopback --passphrase-file "$CAVE_CARRY_PASSPHRASE_FILE")
fi

umask 077
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT

# Copies $1, when it exists, to $2 inside the stage.
take() {
  [ -e "$1" ] || return 0
  mkdir -p "$(dirname "$stage/$2")"
  cp -a "$1" "$stage/$2"
  echo "packed $1"
}

# Copies every file under $1 to the same place under $2, keeping the files already there.
place() {
  [ -d "$1" ] || return 0
  (cd "$1" && find . -type f -print0) | while IFS= read -r -d '' file; do
    file="${file#./}"
    if [ -e "$2/$file" ]; then
      echo "kept existing $2/$file"
    else
      mkdir -p "$(dirname "$2/$file")"
      cp -p "$1/$file" "$2/$file"
      echo "restored $2/$file"
    fi
  done
}

pack() {
  local out
  out="$1/cave-carry-$(date +%Y-%m-%d).tar.gpg"
  take "$root/.env" checkout/.env
  take "$root/data" checkout/data
  take "$root/.claude/settings.local.json" checkout/.claude/settings.local.json
  take "$HOME/.ssh" home/.ssh
  take "$HOME/.claude/CLAUDE.md" home/.claude/CLAUDE.md
  take "$HOME/.claude/settings.json" home/.claude/settings.json
  take "$memory" memory
  if [ -e "$keys_file" ]; then
    take "$keys_file" home/.config/environment.d/cave.conf
  else
    # WSL passed the keys in from Windows variables: carry them as the keys file.
    mkdir -p "$stage/home/.config/environment.d"
    for key in "${keys[@]}"; do
      [ -n "${!key:-}" ] || echo "no $key in the environment; its line stays empty" >&2
      printf '%s=%s\n' "$key" "${!key:-}"
    done >"$stage/home/.config/environment.d/cave.conf"
    echo "packed the keys from the environment as $keys_file"
  fi
  tar -C "$stage" -cf - . | gpg "${gpg_args[@]}" --symmetric --cipher-algo AES256 --output "$out"
  echo "Wrote $out. Keep the passphrase in your password manager, not next to the file."
}

unpack() {
  gpg "${gpg_args[@]}" --decrypt "$1" | tar -C "$stage" -xf -
  place "$stage/checkout" "$root"
  place "$stage/home" "$HOME"
  place "$stage/memory" "$memory"
  echo "Done. Run setup/setup.sh, then log out and back in for the keys file."
}

case "${1:-}" in
  pack)
    [ -d "${2:-}" ] || { echo "usage: setup/carry.sh pack <existing dir>" >&2; exit 2; }
    pack "$(cd "$2" && pwd)"
    ;;
  unpack)
    [ -f "${2:-}" ] || { echo "usage: setup/carry.sh unpack <file>" >&2; exit 2; }
    unpack "$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
    ;;
  *)
    echo "usage: setup/carry.sh pack <dir> | unpack <file>" >&2
    exit 2
    ;;
esac
