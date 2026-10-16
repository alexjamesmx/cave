#!/usr/bin/env bash
# Exercises deploy/cave-offsite against a local restic repository, real SQLite backups and the
# app's own verify-backup. Run by cave-offsite.test.ts where restic is installed; also by hand:
#   bash server/ops/cave-offsite.test.sh
set -euo pipefail

here="$(cd "$(dirname "$0")/../.." && pwd)"
script="$here/deploy/cave-offsite"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fails=0

ok() { echo "ok   $1"; }
bad() { echo "FAIL $1" >&2; fails=$((fails + 1)); }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1: expected '$3', got '$2'"; fi; }

# The VPS layout in miniature: backups, the release the app runs from, state, cache.
src="$tmp/backups"
mkdir -p "$src/pre-deploy" "$tmp/cave" "$tmp/state"
ln -s "$here" "$tmp/cave/current"
openssl rand -base64 48 >"$tmp/offsite.key"
export RESTIC_REPOSITORY="$tmp/repo" RESTIC_PASSWORD_FILE="$tmp/offsite.key"
restic init --quiet >/dev/null

# A backup as the server writes it: a SQLite file whose docs table holds $2 rows.
make_db() {
  DB="$1" N="$2" bun -e '
    import { Database } from "bun:sqlite";
    const db = new Database(process.env.DB, { create: true });
    db.run("CREATE TABLE docs (id TEXT PRIMARY KEY)");
    for (let i = 0; i < Number(process.env.N); i++) db.run("INSERT INTO docs VALUES (?)", [`d${i}`]);
    db.close();'
}

run() {
  env CAVE_OFFSITE_SOURCE="$src" CAVE_OFFSITE_STATE="$tmp/state" CAVE_ROOT="$tmp/cave" \
    CAVE_BUN_BIN="$(dirname "$(command -v bun)")" RESTIC_CACHE_DIR="$tmp/cache" \
    bash "$script" "$@"
}
status() { cat "$tmp/state/status.json"; }
json() { bun -e "const s = JSON.parse(require('fs').readFileSync('$tmp/state/status.json', 'utf8')); console.log(String($1))"; }

make_db "$src/cave-2026-10-14T0300.db" 2
make_db "$src/cave-2026-10-15T0300.db" 3
make_db "$src/pre-deploy/cave-2026-10-15T120000-abcdef1.db" 3
echo "half written" >"$src/cave-2026-10-16T0300.db.part"
echo "refused" >"$src/cave-2026-10-13T0300.db.failed"

out=$(run status)
check "status before any run says so" "$out" "no off-box run recorded yet"

run backup >/dev/null
check "backup is ok" "$(json 's.backup.ok')" "true"
check "backup names the newest daily file" "$(json 's.backup.file')" "cave-2026-10-15T0300.db"
check "backup records its doc count" "$(json 's.backup.docs')" "3"
check "backup records the snapshot" "$(json 's.backup.snapshot')" "$(restic snapshots latest --json | grep -o '"short_id":"[0-9a-f]*"' | cut -d'"' -f4)"
[ -n "$(json 's.backup.lastOkAt')" ] && ok "backup records when it last succeeded" || bad "backup records lastOkAt"
check "no check has run yet" "$(json 's.check')" "null"
check "the count file remembers the file's docs" "$(cat "$tmp/state/counts")" "cave-2026-10-15T0300.db 3"
listed=$(restic ls latest)
grep -q "pre-deploy/cave-2026-10-15T120000-abcdef1.db" <<<"$listed" && ok "pre-deploy backups go too" || bad "pre-deploy backups go too"
grep -q '\.part$' <<<"$listed" && bad "a .part file must be excluded" || ok "a .part file is excluded"
grep -q '\.failed$' <<<"$listed" && bad "a .failed file must be excluded" || ok "a .failed file is excluded"
check "the snapshot is tagged cave" "$(restic snapshots --tag cave --json | grep -c '"short_id"')" "1"

out=$(run check)
check "check is ok" "$(json 's.check.ok')" "true"
check "check restored the newest daily" "$(json 's.check.file')" "cave-2026-10-15T0300.db"
check "check reports the restored docs" "$(json 's.check.docs')" "3"
[[ "$out" == *"integrity ok, 3 docs (recorded 3)"* ]] && ok "check says what it verified" || bad "check output: $out"
check "the backup part is kept" "$(json 's.backup.ok')" "true"

# A copy with fewer docs than were recorded when it was backed up fails the check.
cp "$tmp/state/counts" "$tmp/counts.good"
echo "cave-2026-10-15T0300.db 9" >"$tmp/state/counts"
if run check >/dev/null 2>&1; then bad "fewer docs than recorded must fail"; else ok "fewer docs than recorded fails"; fi
check "it is recorded" "$(json 's.check.ok')/$(json 's.check.error')" "false/the restored copy has fewer docs than recorded"
mv "$tmp/counts.good" "$tmp/state/counts"

# A corrupted file in the newest snapshot fails the check: SQLite refuses the restored copy.
make_db "$src/cave-2026-10-16T0300.db" 4
echo "cave-2026-10-16T0300.db 4" >>"$tmp/state/counts"
printf 'garbage%.0s' $(seq 1 600) | dd of="$src/cave-2026-10-16T0300.db" bs=1 seek=100 conv=notrunc status=none
restic backup "$src" --tag cave --quiet
if run check >/dev/null 2>&1; then bad "a corrupted file must fail the check"; else ok "a corrupted file fails the check"; fi
check "the corrupted copy is named" "$(json 's.check.file')/$(json 's.check.error')" "cave-2026-10-16T0300.db/the restored copy does not verify"

# The same corrupted file never goes up through cave-offsite: backup verifies first.
before=$(json 's.backup.lastOkAt')
if run backup >/dev/null 2>&1; then bad "a newest daily that does not verify must fail backup"; else ok "a newest daily that does not verify fails backup"; fi
check "the failure is recorded" "$(json 's.backup.ok')/$(json 's.backup.error')" "false/the newest daily backup does not verify"
check "the last success is kept" "$(json 's.backup.lastOkAt')" "$before"
rm "$src/cave-2026-10-16T0300.db"

# An unreachable repository: the failure is recorded, and no secret reaches the status file.
if RESTIC_REPOSITORY="$tmp/no-such-repo" run backup >/dev/null 2>&1; then bad "an unreachable repository must fail"; else ok "an unreachable repository fails"; fi
check "it says restic failed" "$(json 's.backup.error')" "restic backup failed"
check "the last success is still kept" "$(json 's.backup.lastOkAt')" "$before"
for secret in "$(cat "$tmp/offsite.key")" "$tmp/repo" "no-such-repo"; do
  grep -qF -- "$secret" "$tmp/state/status.json" && bad "status.json must not hold $secret" || ok "status.json holds no key or repository"
done

run backup >/dev/null
check "the next good run is ok again" "$(json 's.backup.ok')" "true"
check "status.json is world-readable for the Cave" "$(stat -c %a "$tmp/state/status.json")" "644"
[ -z "$(find "$tmp/state" -name '.status.*' -o -name '.part.*')" ] && ok "no temporary files are left" || bad "temporary files left"

if [ "$fails" -gt 0 ]; then
  echo "$fails failed" >&2
  exit 1
fi
echo "all passed"
