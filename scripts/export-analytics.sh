#!/usr/bin/env bash
# Best-effort analytics publish for the daily cloud refresh (#548 slice 1).
#
# Runs after the state dump: exports today's dense price series, uploads the
# partition to the `analytics-data` release, downloads the earlier partitions
# from that release (a fresh runner only holds today's), rebuilds the dbt marts
# over the whole series and commits the refreshed basket-index JSON. The workflow marks the step
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

# Merge every release partition into the data dir without clobbering the ones
# exported on this run (today's fresh export wins over its release copy).
# The script runs without errexit (and `if ! run_stage` would suppress it), so
# every filesystem step is checked explicitly.
download_history() {
  local data_dir="$1"
  local staging
  if ! staging="$(mktemp -d)"; then
    log "could not create a staging dir for the release history"
    return 1
  fi
  if ! scripts/analytics-data.sh download "$staging" >/dev/null; then
    rm -rf "$staging"
    return 1
  fi
  if ! mkdir -p "$data_dir"; then
    log "could not create $data_dir"
    rm -rf "$staging"
    return 1
  fi
  local partition name added=0
  for partition in "$staging"/date=*; do
    [ -f "$partition/part.parquet" ] || continue
    name="$(basename "$partition")"
    [ -e "$data_dir/$name/part.parquet" ] && continue
    if ! mkdir -p "$data_dir/$name"; then
      log "could not create $data_dir/$name"
      rm -rf "$staging"
      return 1
    fi
    if ! mv "$partition/part.parquet" "$data_dir/$name/part.parquet"; then
      log "could not move $name into $data_dir"
      rm -rf "$staging"
      return 1
    fi
    added=$((added + 1))
  done
  rm -rf "$staging"
  log "merged $added historical partition(s) into $data_dir"
}

# The step is continue-on-error, so a kept index would otherwise only show in
# the log; the annotation puts it on the run summary. Never fails.
keep_published_index() {
  log "release history unavailable; keeping the published basket index"
  printf '::warning title=Analytics basket index not refreshed::The analytics-data release history could not be downloaded; the published basket index was kept unchanged.\n'
  return 0
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
  # Without the history the build would publish a one-day series over the
  # committed multi-day index; keep the published payload instead.
  if ! run_stage download download_history "$DATA_DIR"; then
    keep_published_index
    return 0
  fi
  run_stage analytics analytics_pipeline || true
  run_stage commit commit_basket_index || true
  return 0
}

# Sourcing (tests) only defines the helpers; executing runs the stages.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
