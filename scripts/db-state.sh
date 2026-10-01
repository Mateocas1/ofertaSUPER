#!/usr/bin/env bash
# Cloud refresh state helpers (#547 slice 2).
#
# The daily GitHub Actions refresh keeps the Postgres state as a custom-format
# dump attached to the GitHub Release `db-state` (public repo, built-in
# GITHUB_TOKEN only, no extra accounts). This script owns every gh release
# interaction so the workflow stays readable and the logic stays testable.
#
# Subcommands:
#   download <dir>        download the newest ofertasuper-*.dump asset
#   restore  <dumpfile>   pg_restore --no-owner --no-acl into $DATABASE_URL
#   dump     <outfile>    pg_dump -Fc --no-owner --no-acl from $DATABASE_URL
#   upload   <dumpfile>   upload as ofertasuper-<UTC date>.dump (clobber)
#   prune                 keep only the newest $DB_STATE_KEEP assets
#
# Every failure prints `db-state: <REASON>: <detail>` and exits non-zero.
# Never print $DATABASE_URL or any credential.
set -euo pipefail

RELEASE_TAG="${DB_STATE_RELEASE:-db-state}"
KEEP_ASSETS="${DB_STATE_KEEP:-14}"
ASSET_REGEX='^ofertasuper-[0-9]{4}-[0-9]{2}-[0-9]{2}\.dump$'

log() {
  printf 'db-state: %s\n' "$*" >&2
}

fail() {
  printf 'db-state: %s: %s\n' "$1" "${2:-}" >&2
  exit "${3:-1}"
}

require_database_url() {
  if [ -z "${DATABASE_URL:-}" ]; then
    fail "MISSING_DATABASE_URL" "DATABASE_URL is not set"
  fi
}

require_gh() {
  if ! command -v gh >/dev/null 2>&1; then
    fail "MISSING_GH" "the gh CLI is not installed"
  fi
}

# Names of the state assets in the release, sorted ascending by date.
state_asset_names() {
  grep -E "$ASSET_REGEX" | sort || true
}

release_asset_names() {
  gh release view "$RELEASE_TAG" --json assets --jq '.assets[].name' 2>/dev/null
}

cmd_download() {
  local dir="${1:-}"
  if [ -z "$dir" ]; then
    fail "USAGE" "download <dir>"
  fi
  require_gh
  mkdir -p "$dir"

  local names
  if ! names=$(release_asset_names); then
    fail "NO_STATE_RELEASE" "release $RELEASE_TAG not found or not readable" 2
  fi

  local latest
  latest=$(printf '%s\n' "$names" | state_asset_names | tail -n1)
  if [ -z "$latest" ]; then
    fail "NO_STATE_ASSET" "release $RELEASE_TAG has no ofertasuper-*.dump asset (seed the first one from the local database)" 2
  fi

  gh release download "$RELEASE_TAG" --pattern "$latest" --dir "$dir" --clobber
  log "downloaded $latest"
  printf '%s\n' "$dir/$latest"
}

cmd_restore() {
  local dumpfile="${1:-}"
  if [ -z "$dumpfile" ]; then
    fail "USAGE" "restore <dumpfile>"
  fi
  require_database_url
  if [ ! -s "$dumpfile" ]; then
    fail "MISSING_DUMP" "$dumpfile is missing or empty"
  fi

  # --clean --if-exists keeps the restore idempotent against the metadata-only
  # schema the Postgres service container ships with.
  if ! pg_restore --no-owner --no-acl --clean --if-exists --exit-on-error --dbname "$DATABASE_URL" "$dumpfile" >&2; then
    fail "RESTORE_FAILED" "pg_restore could not load $dumpfile" 3
  fi
  log "restored $dumpfile"
}

cmd_dump() {
  local outfile="${1:-}"
  if [ -z "$outfile" ]; then
    fail "USAGE" "dump <outfile>"
  fi
  require_database_url

  if ! pg_dump -Fc --no-owner --no-acl --dbname "$DATABASE_URL" --file "$outfile" >&2; then
    fail "DUMP_FAILED" "pg_dump could not read the database" 4
  fi
  if [ ! -s "$outfile" ]; then
    fail "DUMP_FAILED" "pg_dump produced an empty file" 4
  fi
  log "dumped to $outfile"
}

cmd_upload() {
  local dumpfile="${1:-}"
  if [ -z "$dumpfile" ]; then
    fail "USAGE" "upload <dumpfile>"
  fi
  require_gh
  if [ ! -s "$dumpfile" ]; then
    fail "MISSING_DUMP" "$dumpfile is missing or empty"
  fi

  if ! gh release view "$RELEASE_TAG" >/dev/null 2>&1; then
    gh release create "$RELEASE_TAG" \
      --title "Catalog database state" \
      --notes "Rolling Postgres state for the cloud refresh (\`ofertasuper-*.dump\`). Managed by the daily-refresh workflow; keep the newest ${KEEP_ASSETS} assets." \
      >/dev/null
    log "created release $RELEASE_TAG"
  fi

  local asset_name="${DB_STATE_ASSET_NAME:-ofertasuper-$(date -u +%F).dump}"
  if ! gh release upload "$RELEASE_TAG" "$dumpfile#$asset_name" --clobber >/dev/null; then
    fail "UPLOAD_FAILED" "could not upload $asset_name" 5
  fi
  log "uploaded $asset_name"
  printf '%s\n' "$asset_name"
}

cmd_prune() {
  require_gh

  local names
  if ! names=$(release_asset_names); then
    fail "NO_STATE_RELEASE" "release $RELEASE_TAG not found or not readable" 2
  fi

  local total
  total=$(printf '%s\n' "$names" | state_asset_names | grep -c . || true)

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
  done < <(printf '%s\n' "$names" | state_asset_names | head -n "$excess")
}

usage() {
  cat >&2 <<'EOF'
usage: scripts/db-state.sh <download|restore|dump|upload|prune> [path]

Environment:
  DATABASE_URL         connection string (restore/dump)
  GH_TOKEN             token used by gh for release reads/writes
  DB_STATE_RELEASE     release tag (default: db-state)
  DB_STATE_KEEP        assets to keep (default: 14)
  DB_STATE_ASSET_NAME  override the uploaded asset name
EOF
}

main() {
  local command="${1:-}"
  shift || true
  case "$command" in
    download) cmd_download "$@" ;;
    restore) cmd_restore "$@" ;;
    dump) cmd_dump "$@" ;;
    upload) cmd_upload "$@" ;;
    prune) cmd_prune "$@" ;;
    "" | -h | --help | help) usage; exit 0 ;;
    *) usage; fail "USAGE" "unknown subcommand: $command" ;;
  esac
}

main "$@"
