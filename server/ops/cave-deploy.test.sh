#!/usr/bin/env bash
# Exercises deploy/cave-deploy against a real git repository with fake runuser, systemctl,
# curl and bun. Run by cave-deploy.test.ts on Linux; also runnable by hand:
#   bash server/ops/cave-deploy.test.sh
set -euo pipefail

here="$(cd "$(dirname "$0")/../.." && pwd)"
wrapper="$here/deploy/cave-deploy"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fails=0
TOKEN="tok-$(date +%s)-never-on-a-command-line"

ok() { echo "ok   $1"; }
bad() { echo "FAIL $1" >&2; fails=$((fails + 1)); }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1: expected '$3', got '$2'"; fi; }

calls="$tmp/calls"
: >"$calls"
mkdir -p "$tmp/fakes" "$tmp/bin" "$tmp/home" "$tmp/state"

# Every fake records its argv, so the test can prove the token is never on a command line.
cat >"$tmp/fakes/runuser" <<'FAKE'
#!/usr/bin/env bash
echo "runuser $*" >>"$CALLS"
[ "$1" = -u ] && [ "$3" = -- ] || exit 2
shift 3
exec "$@"
FAKE
cat >"$tmp/fakes/systemctl" <<'FAKE'
#!/usr/bin/env bash
echo "systemctl $*" >>"$CALLS"
FAKE
# The restarted server reports whatever `current` points at, unless that commit is UNHEALTHY.
cat >"$tmp/fakes/curl" <<'FAKE'
#!/usr/bin/env bash
echo "curl $*" >>"$CALLS"
header=""
while [ $# -gt 0 ]; do
  if [ "$1" = -H ]; then header="$2"; shift; fi
  shift
done
[ "$(cat "${header#@}")" = "authorization: Bearer $TOKEN" ] || exit 22
running=$(basename "$(readlink "$CAVE_ROOT/current")")
if [ "$running" = "${UNHEALTHY:-}" ]; then echo '{"commit":"old"}'; else echo "{\"commit\":\"$running\"}"; fi
FAKE
cat >"$tmp/bin/bun" <<'FAKE'
#!/usr/bin/env bash
echo "bun $*" >>"$CALLS"
case "$1" in
  install) [ -n "${SLOW:-}" ] && sleep 2; [ "${FAIL_AT:-}" = install ] && exit 1 ;;
  run) [ "${FAIL_AT:-}" = check ] && exit 1 ;;
  test) [ "${FAIL_AT:-}" = test ] && exit 1 ;;
esac
exit 0
FAKE
chmod +x "$tmp/fakes/"* "$tmp/bin/bun"
printf 'PORT=3000\nCAVE_TOKEN=%s\n' "$TOKEN" >"$tmp/cave.env"

# Origin: every commit carries the release script, as main does.
git init --quiet -b main "$tmp/origin"
mkdir -p "$tmp/origin/deploy"
cp "$here/deploy/release.sh" "$tmp/origin/deploy/release.sh"

commit() {
  n=$(($(git -C "$tmp/origin" rev-list --count HEAD 2>/dev/null || echo 0) + 1))
  echo "$n" >"$tmp/origin/file"
  git -C "$tmp/origin" add -A
  git -C "$tmp/origin" -c user.name=t -c user.email=t@t commit --quiet -m "c$n"
  git -C "$tmp/origin" rev-parse HEAD
}
root="$tmp/cave"
mkdir -p "$root"
sha1=$(commit)
git clone --quiet --bare "$tmp/origin" "$root/repo.git"

run() {
  env PATH="$tmp/fakes:$PATH" CALLS="$calls" TOKEN="$TOKEN" \
    CAVE_ROOT="$root" CAVE_STATE_DIR="$tmp/state" CAVE_ENV_FILE="$tmp/cave.env" \
    CAVE_HEALTH_URL="http://127.0.0.1:3000/api/status" CAVE_HEALTH_SECONDS=1 \
    CAVE_SYSTEMCTL="$tmp/fakes/systemctl" CAVE_LOCK_FILE="$tmp/lock" CAVE_RUN_AS=cave \
    CAVE_HOME="$tmp/home" CAVE_BUN_BIN="$tmp/bin" CAVE_CACHE_DIR="$tmp/cache" \
    FAIL_AT="${FAIL_AT:-}" UNHEALTHY="${UNHEALTHY:-}" SLOW="${SLOW:-}" \
    bash "$wrapper" "$@"
}
target() { if [ -L "$root/$1" ]; then basename "$(readlink "$root/$1")"; fi; }
field() { sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p" "$tmp/state/status.json"; }
count() { grep -c -- "$1" "$calls" || true; }
held() { cat "$tmp/state/held" 2>/dev/null || true; }
fresh() { cat "$calls" >>"$tmp/all-calls"; : >"$calls"; }

out=$(run now)
check "now deploys the tip" "$(target current)" "$sha1"
check "a deploy restarts once" "$(count 'systemctl restart cave')" "1"
check "a healthy deploy is recorded" "$(field result)" "deployed"
check "status names the running commit" "$(field running)" "$sha1"
[[ "$out" == *"== running $sha1"* ]] && ok "now prints the running commit" || bad "now prints the running commit: $out"
grep -q "^runuser -u cave -- env HOME=$tmp/home CAVE_ROOT=$root git -C $root/repo.git fetch" "$calls" &&
  ok "git runs as cave" || bad "git runs as cave"

fresh
run auto
check "auto on the current tip builds nothing" "$(count 'bun install')" "0"
check "auto on the current tip restarts nothing" "$(count 'systemctl')" "0"

sha2=$(commit)
fresh
if FAIL_AT=test run auto >/dev/null 2>&1; then bad "a failed build must fail auto"; else ok "a failed build fails auto"; fi
check "a failed build holds the commit" "$(held)" "$sha2"
check "a failed build leaves current" "$(target current)" "$sha1"
check "a failed build is recorded" "$(field result)" "failed"
check "a failed build names its step" "$(field step)" "test"
check "a failed build restarts nothing" "$(count 'systemctl')" "0"

fresh
run auto
check "auto skips a held tip" "$(count 'bun install')" "0"

fresh
run now >/dev/null
check "now builds a held tip" "$(count 'bun install')" "1"
check "now deploys a held tip" "$(target current)" "$sha2"
check "a healthy deploy clears the hold" "$(held)" ""
check "a healthy deploy is recorded with its commit" "$(field sha)/$(field running)" "$sha2/$sha2"

sha3=$(commit)
fresh
if UNHEALTHY=$sha3 run auto >/dev/null 2>&1; then bad "an unhealthy deploy must fail"; else ok "an unhealthy deploy fails"; fi
check "an unhealthy deploy rolls back" "$(target current)" "$sha2"
check "an unhealthy deploy restarts twice" "$(count 'systemctl restart cave')" "2"
check "an unhealthy deploy holds the commit" "$(held)" "$sha3"
check "an unhealthy deploy is recorded" "$(field result)" "rolled-back"
check "the rolled-back status names both commits" "$(field sha)/$(field running)" "$sha3/$sha2"

run now >/dev/null
check "now retries the held commit" "$(target current)" "$sha3"
fresh
out=$(run rollback)
check "rollback points current at previous" "$(target current)" "$sha2"
check "rollback keeps the release it left as previous" "$(target previous)" "$sha3"
check "rollback holds the tip" "$(held)" "$sha3"
check "rollback restarts once" "$(count 'systemctl restart cave')" "1"
check "rollback is recorded" "$(field result)/$(field sha)/$(field running)" "rolled-back/$sha3/$sha2"
[[ "$out" == *"== running $sha2"* ]] && ok "rollback prints the running commit" || bad "rollback prints the running commit: $out"
fresh
run auto
check "auto leaves a rolled-back tip alone" "$(count 'bun install')" "0"

run now >/dev/null
check "now after rollback redeploys the tip" "$(target current)" "$sha3"

sha4=$(commit)
fresh
SLOW=1 run auto >"$tmp/a.out" 2>&1 &
first=$!
sleep 0.5
SLOW=1 run auto >"$tmp/b.out" 2>&1 &
second=$!
wait "$first" && wait "$second" && ok "two concurrent autos both exit 0" || bad "two concurrent autos both exit 0"
check "two concurrent autos build once" "$(count 'bun install')" "1"
check "the deploy that ran is current" "$(target current)" "$sha4"

out=$(run status)
[[ "$out" == *"\"result\":\"deployed\""* ]] && ok "status prints status.json" || bad "status prints status.json: $out"

fresh
check "the token is never on any command line" "$(grep -c -- "$TOKEN" "$tmp/all-calls" || true)" "0"
[ "$(grep -c "^curl " "$tmp/all-calls")" -gt 0 ] && ok "the health checks were recorded" || bad "the health checks were recorded"
[ "$(stat -c %a "$tmp/state/status.json")" = 644 ] && ok "status.json is world-readable" || bad "status.json mode"

if [ "$fails" -gt 0 ]; then
  echo "$fails failed" >&2
  exit 1
fi
echo "all passed"
