#!/usr/bin/env bash
# Runs on the VPS as user cave; cave-deploy pipes in the copy from the commit it builds.
#   build <sha>  fetch <sha>, install, check and test it in its own release directory,
#                and only then switch `current` to it
#   rollback     point `current` at the previous release
#   prune        keep the newest releases, never `current` or `previous`
# The service runs from `current`, so it only ever starts a release that passed its tests.
set -Eeuo pipefail

root="${CAVE_ROOT:-/opt/cave}"
keep="${CAVE_KEEP_RELEASES:-5}"
# CAVE_BUN_BIN lets the tests put a fake bun first; on the VPS it is the pinned Bun.
export PATH="${CAVE_BUN_BIN:-/opt/bun/bin}:$PATH"
# Every cache stays out of the data directory, which holds only data: Bun's install cache,
# its runtime transpiler cache (default ~/.bun) and Biome's (default ~/.cache).
cache="${CAVE_CACHE_DIR:-/var/cache/cave-bun}"
export BUN_INSTALL_CACHE_DIR="$cache"
export BUN_RUNTIME_TRANSPILER_CACHE_PATH="$cache/transpiler"
export XDG_CACHE_HOME="$cache/xdg"

step=""
trap 'echo "deploy failed at: $step" >&2' ERR

target_of() { if [ -L "$root/$1" ]; then basename "$(readlink "$root/$1")"; fi; }

# A new link renamed over the old one: readers see either release, never neither.
point() {
  ln -sfn "releases/$2" "$root/$1.new"
  mv -T "$root/$1.new" "$root/$1"
}

prune() {
  local current previous
  current=$(target_of current)
  previous=$(target_of previous)
  ls -1t "$root/releases" | tail -n +"$((keep + 1))" | while read -r old; do
    if [ "$old" = "$current" ] || [ "$old" = "$previous" ]; then continue; fi
    git -C "$root/repo.git" worktree remove --force "$root/releases/$old"
  done
  git -C "$root/repo.git" worktree prune
}

build() {
  local sha="$1" rel="$root/releases/$1" current
  step=args
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "not a full commit id: $sha" >&2; return 2; }
  step=fetch
  git -C "$root/repo.git" fetch --quiet origin '+refs/heads/main:refs/heads/main'
  step=verify
  git -C "$root/repo.git" merge-base --is-ancestor "$sha" main
  current=$(target_of current)
  if [ "$current" = "$sha" ]; then
    echo "== $sha is already current"
    return 0
  fi
  step=worktree
  mkdir -p "$root/releases"
  if [ -d "$rel" ]; then git -C "$root/repo.git" worktree remove --force "$rel"; fi
  git -C "$root/repo.git" worktree add --quiet --detach "$rel" "$sha"
  cd "$rel"
  step=install
  bun install --frozen-lockfile
  step=check
  bun run check
  step=test
  bun test
  cd "$root"
  step=switch
  if [ -n "$current" ]; then point previous "$current"; fi
  point current "$sha"
  step=prune
  prune
  echo "== switched to $sha"
}

rollback() {
  local current previous
  step=rollback
  current=$(target_of current)
  previous=$(target_of previous)
  if [ -z "$previous" ] || [ ! -d "$root/releases/$previous" ]; then
    echo "no previous release to roll back to" >&2
    return 1
  fi
  point current "$previous"
  point previous "$current"
  echo "== rolled back to $previous"
}

case "${1:-}" in
  build) build "${2:-}" ;;
  rollback) rollback ;;
  prune) step=prune; prune ;;
  *) echo "usage: release.sh build <sha> | rollback | prune" >&2; exit 2 ;;
esac
