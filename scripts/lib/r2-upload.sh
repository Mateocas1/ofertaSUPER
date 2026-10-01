#!/usr/bin/env bash
# Optional, fail-soft, encrypted off-site copy of the daily pg_dump.
# Sourced by cron-refresh.sh; see docs/RUNBOOK.md ("Encrypted off-site backup").
#
# Contract: r2_upload_backup NEVER returns non-zero and never prints secrets.
# It logs one line per outcome and only reports exit codes from rclone.

r2_upload_backup() {
  local backup="$1"
  local env_file="${R2_ENV_FILE:-$HOME/.config/ofertasuper/r2.env}"
  local timeout_s="${R2_UPLOAD_TIMEOUT:-300}"
  local marker="${backup}.r2-uploaded"
  local name status=0

  if [ ! -f "$env_file" ]; then
    echo "r2 upload skipped: $env_file not found"
    return 0
  fi
  if ! command -v rclone > /dev/null 2>&1; then
    echo "r2 upload skipped: rclone not found in PATH"
    return 0
  fi
  if [ -e "$marker" ]; then
    echo "r2 upload skipped: already uploaded today"
    return 0
  fi

  name=$(basename "$backup")
  # A subshell keeps the secrets out of the parent environment. Nothing in it
  # is traced or echoed. Any failure (bad env file, network, timeout) ends up
  # in $status and is only logged.
  (
    set +x
    set -a
    # shellcheck disable=SC1090
    . "$env_file"
    set +a
    : "${R2_REMOTE:?}"
    days="${R2_RETENTION_DAYS:-7}"
    case "$days" in '' | *[!0-9]*) days=7 ;; esac
    timeout "$timeout_s" rclone copyto "$backup" "$R2_REMOTE:$name" > /dev/null 2>&1 || exit 10
    timeout "$timeout_s" rclone delete "$R2_REMOTE:" --min-age "${days}d" \
      --include 'ofertasuper-*.dump' > /dev/null 2>&1 || exit 11
  ) || status=$?

  case "$status" in
    0)
      : > "$marker"
      echo "r2 upload ok: $name"
      ;;
    10)
      echo "r2 upload failed (copy); continuing without off-site backup"
      ;;
    11)
      : > "$marker"
      echo "r2 upload ok: $name (retention prune failed; continuing)"
      ;;
    *)
      echo "r2 upload failed (config, status $status); continuing without off-site backup"
      ;;
  esac
  return 0
}
