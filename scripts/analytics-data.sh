#!/usr/bin/env bash
# Analytics data release helpers (#548 slice 1).
#
# The daily price series lives as one gzip-free Parquet asset per day in the
# GitHub Release `analytics-data` (public repo, built-in GITHUB_TOKEN only).
# This script owns every gh release interaction so the workflow stays readable
# and the logic stays testable, mirroring scripts/db-state.sh.
#
# Subcommands:
#   upload      <file> [name]  upload one file (default: price-series-<UTC date>.parquet)
#   upload-dir  <dir>          upload every date=*/part.parquet as price-series-<date>.parquet
#   download    <dir>          download every price-series-*.parquet into date=<date>/part.parquet
#   prune                      keep only the newest $ANALYTICS_DATA_KEEP assets
#
# Every failure prints `analytics-data: <REASON>: <detail>` and exits non-zero.
set -euo pipefail

RELEASE_TAG="${ANALYTICS_DATA_RELEASE:-analytics-data}"
KEEP_ASSETS="${ANALYTICS_DATA_KEEP:-60}"
ASSET_REGEX='^price-series-[0-9]{4}-[0-9]{2}-[0-9]{2}\.parquet$'

log() {
  printf 'analytics-data: %s\n' "$*" >&2
}

fail() {
  printf 'analytics-data: %s: %s\n' "$1" "${2:-}" >&2
  exit "${3:-1}"
}

require_gh() {
  if ! command -v gh >/dev/null 2>&1; then
    fail "MISSING_GH" "the gh CLI is not installed"
  fi
}

release_asset_names() {
  gh release view "$RELEASE_TAG" --json assets --jq '.assets[].name' 2>/dev/null
}

series_asset_names() {
  grep -E "$ASSET_REGEX" | sort || true
}

ensure_release() {
  if ! gh release view "$RELEASE_TAG" >/dev/null 2>&1; then
    gh release create "$RELEASE_TAG" \
      --title "Analytics data" \
      --notes "Daily dense price series for the analytics product (\`price-series-<date>.parquet\`). Managed by the daily-refresh workflow; keep the newest ${KEEP_ASSETS} assets." \
      >/dev/null
    log "created release $RELEASE_TAG"
  fi
}

upload_file() {
  local file="$1"
  local asset_name="$2"
  if [ ! -s "$file" ]; then
    fail "MISSING_FILE" "$file is missing or empty"
  fi

  local staging
  staging="$(mktemp -d)"
  cp "$file" "$staging/$asset_name"
  if ! gh release upload "$RELEASE_TAG" "$staging/$asset_name" --clobber >/dev/null; then
    rm -rf "$staging"
    fail "UPLOAD_FAILED" "could not upload $asset_name" 5
  fi
  rm -rf "$staging"
  log "uploaded $asset_name"
  printf '%s\n' "$asset_name"
}

cmd_upload() {
  local file="${1:-}"
  local name="${2:-}"
  if [ -z "$file" ]; then
    fail "USAGE" "upload <file> [name]"
  fi
  require_gh
  ensure_release
  upload_file "$file" "${name:-${ANALYTICS_DATA_ASSET_NAME:-price-series-$(date -u +%F).parquet}}"
}

cmd_upload_dir() {
  local dir="${1:-}"
  if [ -z "$dir" ]; then
    fail "USAGE" "upload-dir <dir>"
  fi
  require_gh
  local partitions=()
  while IFS= read -r partition; do
    [ -n "$partition" ] || continue
    partitions+=("$partition")
  done < <(find "$dir" -mindepth 2 -maxdepth 2 -path '*/date=*/part.parquet' 2>/dev/null | sort)

  if [ "${#partitions[@]}" -eq 0 ]; then
    fail "NO_PARTITIONS" "$dir has no date=*/part.parquet partitions" 2
  fi

  ensure_release
  local partition date
  for partition in "${partitions[@]}"; do
    date="$(basename "$(dirname "$partition")")"
    upload_file "$partition" "price-series-${date#date=}.parquet" >/dev/null
  done
}

cmd_download() {
  local dir="${1:-}"
  if [ -z "$dir" ]; then
    fail "USAGE" "download <dir>"
  fi
  require_gh

  local names
  if ! names=$(release_asset_names); then
    fail "NO_DATA_RELEASE" "release $RELEASE_TAG not found or not readable" 2
  fi
  local assets
  assets=$(printf '%s\n' "$names" | series_asset_names)
  if [ -z "$assets" ]; then
    fail "NO_DATA_ASSET" "release $RELEASE_TAG has no price-series-*.parquet asset" 2
  fi

  local staging
  staging="$(mktemp -d)"
  for asset in $assets; do
    gh release download "$RELEASE_TAG" --pattern "$asset" --dir "$staging" --clobber
    date="${asset#price-series-}"
    date="${date%.parquet}"
    mkdir -p "$dir/date=$date"
    cp "$staging/$asset" "$dir/date=$date/part.parquet"
  done
  rm -rf "$staging"
  log "downloaded $(printf '%s\n' "$assets" | grep -c .) partition(s) into $dir"
  printf '%s\n' "$dir"
}

cmd_prune() {
  require_gh

  local names
  if ! names=$(release_asset_names); then
    fail "NO_DATA_RELEASE" "release $RELEASE_TAG not found or not readable" 2
  fi

  local total
  total=$(printf '%s\n' "$names" | series_asset_names | grep -c . || true)

  local excess=$((total - KEEP_ASSETS))
  if [ "$excess" -le 0 ]; then
    log "prune: ${total} assets, nothing to remove"
    return 0
  fi

  local name
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    if ! gh release delete-asset "$RELEASE_TAG" "$name" --yes >/dev/null 2>&1; then
      fail "PRUNE_FAILED" "could not delete $name" 6
    fi
    log "pruned $name"
  done < <(printf '%s\n' "$names" | series_asset_names | head -n "$excess")
}

usage() {
  cat >&2 <<'EOF'
usage: scripts/analytics-data.sh <upload|upload-dir|download|prune> [path]

Environment:
  GH_TOKEN                 token used by gh for release reads/writes
  ANALYTICS_DATA_RELEASE   release tag (default: analytics-data)
  ANALYTICS_DATA_KEEP      assets to keep (default: 60)
  ANALYTICS_DATA_ASSET_NAME  override the uploaded asset name for `upload`
EOF
}

main() {
  local command="${1:-}"
  shift || true
  case "$command" in
    upload) cmd_upload "$@" ;;
    upload-dir) cmd_upload_dir "$@" ;;
    download) cmd_download "$@" ;;
    prune) cmd_prune "$@" ;;
    "" | -h | --help | help) usage; exit 0 ;;
    *) usage; fail "USAGE" "unknown subcommand: $command" ;;
  esac
}

main "$@"
