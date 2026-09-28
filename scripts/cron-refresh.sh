#!/usr/bin/env bash
# Gate 6 — daily catalog refresh (cron entry). Runs from the dedicated
# worktree prepared by cron-refresh-entry.sh, never touches other worktrees,
# and publishes the snapshot only when the run is healthy.
set -euo pipefail

STAMP=$(date +%Y%m%d)
DATE=$(date +%F)
REFRESH_WORKTREE="$HOME/code/ofertaSUPER-refresh"
LOG_DIR="$HOME/.local/state/ofertasuper"
CONTAINER="ofertasuper-cmvp-local-bootstrap-postgres-1"
NETWORK="ofertasuper-cmvp-local-bootstrap_default"
MIGRATE_IMAGE="ofertasuper-cmvp-local-bootstrap-migrate:latest"

mkdir -p "$LOG_DIR" "$HOME/backups"
LOG="$LOG_DIR/refresh-$DATE.log"
exec >>"$LOG" 2>&1
echo "=== refresh $STAMP started $(date -Is) ==="

# One refresh at a time; the lock lives outside the worktree so it never
# blocks the worktree checkout.
exec 9>"$LOG_DIR/refresh.lock"
if ! flock -n 9; then
  echo "another refresh is still running; aborting"
  exit 1
fi

cd "$REFRESH_WORKTREE"

# Guardrail 10: backup before the first write of the day.
BACKUP="$HOME/backups/ofertasuper-$DATE.dump"
if [ ! -s "$BACKUP" ]; then
  docker exec "$CONTAINER" pg_dump -U ofertasuper_owner -d ofertasuper -Fc > "$BACKUP"
fi
if [ ! -s "$BACKUP" ]; then
  echo "backup is empty; aborting"
  exit 1
fi
echo "backup ready: $BACKUP ($(stat -c%s "$BACKUP") bytes)"

# The database is only reachable from the bootstrap network; the refresh runs
# inside a container on that network with the worktree mounted.
export POSTGRES_PASSWORD
POSTGRES_PASSWORD=$(docker exec "$CONTAINER" printenv POSTGRES_PASSWORD)
export DATABASE_URL="postgresql://ofertasuper_owner:${POSTGRES_PASSWORD}@postgres:5432/ofertasuper"
export DIRECT_URL="$DATABASE_URL"

# Install or refresh dependencies when the lockfile changes.
LOCK_HASH=$(sha256sum package-lock.json | cut -d" " -f1)
if [ ! -d node_modules ] || [ ! -f node_modules/.lock-hash ] || [ "$(cat node_modules/.lock-hash)" != "$LOCK_HASH" ]; then
  npm ci --no-audit --no-fund
  echo "$LOCK_HASH" > node_modules/.lock-hash
fi
npx prisma generate

if ! docker run --rm --network "$NETWORK" -v "$REFRESH_WORKTREE":/app -w /app \
  -e DATABASE_URL -e DIRECT_URL \
  --entrypoint npm "$MIGRATE_IMAGE" run refresh:catalog; then
  echo "refresh gate check failed; no PR will be opened"
  exit 1
fi

BRANCH="chore/catalog-refresh-$STAMP"
git checkout -b "$BRANCH"
git add data/catalog-snapshot.json
if git diff --cached --quiet; then
  echo "snapshot unchanged; nothing to publish"
  exit 0
fi
git commit -q -m "chore(catalog): refresh $DATE

Refs #498"
git push -q origin "$BRANCH"

PR=$(gh pr create --base master --head "$BRANCH" \
  --title "chore(catalog): refresh $DATE" \
  --body "Snapshot diario del refresh automatizado.

Refs #498")

if gh pr merge "$BRANCH" --auto --merge --delete-branch 2>/dev/null; then
  echo "auto-merge enabled for $PR"
else
  gh pr checks "$BRANCH" --watch
  gh pr merge "$BRANCH" --merge --delete-branch 2>/dev/null || true
fi

# gh's local branch cleanup fails inside a detached worktree; the source of
# truth for the outcome is the PR state on GitHub.
for _ in $(seq 1 30); do
  STATE=$(gh pr view "$BRANCH" --json state -q .state 2>/dev/null || echo "UNKNOWN")
  if [ "$STATE" = "MERGED" ]; then
    echo "PR merged"
    echo "=== refresh $STAMP finished $(date -Is) ==="
    exit 0
  fi
  if [ "$STATE" = "CLOSED" ]; then break; fi
  sleep 10
done
echo "PR did not reach MERGED state; failing"
exit 1
