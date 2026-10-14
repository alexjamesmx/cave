#!/usr/bin/env bash
# Exercises deploy/release.sh against a real git repository and a fake bun.
# Run by release.test.ts on Linux; also runnable by hand: bash server/ops/release.test.sh
set -euo pipefail

script="$(cd "$(dirname "$0")/../../deploy" && pwd)/release.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fails=0

ok() { echo "ok   $1"; }
bad() { echo "FAIL $1" >&2; fails=$((fails + 1)); }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1: expected '$3', got '$2'"; fi; }

# A fake bun: install and check pass unless FAIL_AT names them; `bun test` likewise.
mkdir -p "$tmp/bin"
cat > "$tmp/bin/bun" <<'FAKE'
#!/usr/bin/env bash
case "$1" in
  install) [ "${FAIL_AT:-}" = install ] && exit 1 ;;
  run) [ "${FAIL_AT:-}" = check ] && exit 1 ;;
  test) [ "${FAIL_AT:-}" = test ] && exit 1 ;;
esac
exit 0
FAKE
chmod +x "$tmp/bin/bun"

# Origin with six commits, and the bare clone the VPS keeps in /opt/cave/repo.git.
git init --quiet -b main "$tmp/origin"
for n in 1 2 3 4 5 6; do
  echo "$n" > "$tmp/origin/file"
  git -C "$tmp/origin" add file
  git -C "$tmp/origin" -c user.name=t -c user.email=t@t commit --quiet -m "c$n"
done
sha() { git -C "$tmp/origin" rev-parse "HEAD~$((6 - $1))"; }
root="$tmp/cave"
mkdir -p "$root"
git clone --quiet --bare "$tmp/origin" "$root/repo.git"

run() { env PATH="$tmp/bin:$PATH" FAIL_AT="${FAIL_AT:-}" CAVE_ROOT="$root" BUN_INSTALL_CACHE_DIR="$tmp/cache" bash "$script" "$@"; }
target() { if [ -L "$root/$1" ]; then basename "$(readlink "$root/$1")"; fi; }

run build "$(sha 1)" >/dev/null
check "first build becomes current" "$(target current)" "$(sha 1)"
check "a release is a checkout of its commit" "$(cat "$root/releases/$(sha 1)/file")" "1"

run build "$(sha 2)" >/dev/null
check "second build becomes current" "$(target current)" "$(sha 2)"
check "the release it replaced becomes previous" "$(target previous)" "$(sha 1)"

for step in install check test; do
  if out=$(FAIL_AT=$step run build "$(sha 3)" 2>&1); then
    bad "a failing $step must fail the deploy"
  else
    check "a failing $step names the step" "$(grep -o "deploy failed at: $step" <<<"$out")" "deploy failed at: $step"
    check "a failing $step leaves current unchanged" "$(target current)" "$(sha 2)"
    check "a failing $step leaves previous unchanged" "$(target previous)" "$(sha 1)"
  fi
done

if run build "deadbeef" >/dev/null 2>&1; then bad "a short commit id must be refused"; else ok "a short commit id is refused"; fi
unknown=$(printf '%040d' 0)
if run build "$unknown" >/dev/null 2>&1; then bad "a commit not on main must be refused"; else ok "a commit not on main is refused"; fi
check "refused builds leave current unchanged" "$(target current)" "$(sha 2)"

out=$(run rollback)
check "rollback points current at the previous release" "$(target current)" "$(sha 1)"
check "rollback keeps the release it left as previous" "$(target previous)" "$(sha 2)"
check "rollback names the release" "$out" "== rolled back to $(sha 1)"
run rollback >/dev/null
check "a second rollback goes forward again" "$(target current)" "$(sha 2)"

out=$(run build "$(sha 2)")
[[ "$out" == *"is already current"* ]] && ok "the no-op says so" || bad "the no-op says so: $out"

for n in 3 4 5 6; do run build "$(sha "$n")" >/dev/null; done
count=$(ls -1 "$root/releases" | wc -l | tr -d ' ')
check "only the newest five releases are kept" "$count" "5"
[ -d "$root/releases/$(sha 1)" ] && bad "the oldest release should be pruned" || ok "the oldest release is pruned"
check "pruned releases leave the git worktree list" "$(git -C "$root/repo.git" worktree list | grep -c releases)" "5"

# Current pointed at the oldest kept release, then pruned down to one: current and previous stay.
ln -sfn "releases/$(sha 2)" "$root/current"
touch -d "2000-01-01" "$root/releases/$(sha 2)"
CAVE_KEEP_RELEASES=1 run prune >/dev/null
[ -d "$root/releases/$(sha 2)" ] && ok "pruning never removes current" || bad "pruning removed current"
[ -d "$root/releases/$(sha 5)" ] && ok "pruning never removes previous" || bad "pruning removed previous"
[ -d "$root/releases/$(sha 6)" ] && ok "pruning keeps the newest" || bad "pruning removed the newest"
[ -d "$root/releases/$(sha 3)" ] && bad "pruning should remove an old release" || ok "pruning removes old releases"

if [ "$fails" -gt 0 ]; then
  echo "$fails failed" >&2
  exit 1
fi
echo "all passed"
