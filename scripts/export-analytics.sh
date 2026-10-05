#!/usr/bin/env bash
# Best-effort analytics publish for the daily cloud refresh (#548 slice 1).
#
# Runs after the state dump: exports today's dense price series, uploads the
# partition to the `analytics-data` release, rebuilds the dbt marts and commits
# the refreshed basket-index JSON. The workflow marks the step
# `continue-on-error`, so a broken analytics stage never blocks the catalog
# refresh. Every stage logs what it did.
#
# Environment: DATABASE_URL (export), GH_TOKEN (release upload and push).

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DATA_DIR="analytics/data"
INDEX_PATH="data/analytics/basket-index.json"

log() {
  printf 'export-analytics: %s\n' "$*"
}

run_stage() {
  local name="$1"
  shift
  log "stage: $name"
  if "$@"; then
    log "stage ok: $name"
    return 0
  fi
  log "stage failed: $name (the catalog refresh is not blocked)"
  return 1
}

analytics_pipeline() {
  if [ ! -f analytics/uv.lock ]; then
    log "analytics/uv.lock is missing"
    return 1
  fi
  if ! command -v uv >/dev/null 2>&1; then
    log "installing uv"
    python3 -m pip install --user --quiet uv || return 1
    export PATH="$HOME/.local/bin:$PATH"
  fi
  (
    cd analytics &&
      uv run --locked --no-dev python scripts/publish_basket_index.py \
        --glob 'data/*/part.parquet' --source release
  )
}

commit_basket_index() {
  git config user.name "github-actions[bot]"
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
  git add "$INDEX_PATH"
  if git diff --cached --quiet; then
    log "basket index unchanged; nothing to publish"
    return 0
  fi
  git commit -m "chore(analytics): refresh basket index $(date -u +%F) [cloud]"
  # master can move during the run: rebase this data-only commit and retry.
  local attempt
  for attempt in 1 2 3; do
    git pull --rebase --autostash --quiet origin master && git push origin HEAD:master && return 0
    sleep 5
  done
  return 1
}

main() {
  if ! run_stage export npx tsx scripts/export-price-series.ts --mode daily --out "$DATA_DIR"; then
    log "no dense series exported today; skipping upload, analytics and commit"
    return 1
  fi

  run_stage upload scripts/analytics-data.sh upload-dir "$DATA_DIR" || true
  run_stage analytics analytics_pipeline || true
  run_stage commit commit_basket_index || true
  return 0
}

main "$@"
