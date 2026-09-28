#!/usr/bin/env bash
# Gate 6 — stable entry point for the cron daily refresh. The crontab copies
# this file to ~/.local/bin/ofertasuper-refresh (see the Runbook); it prepares
# the dedicated worktree and hands off to the version of cron-refresh.sh that
# is on master right now, so the entry point never needs to change.
set -euo pipefail

MAIN_WORKTREE="/home/picala/code/ofertaSUPER-v1"
REFRESH_WORKTREE="$HOME/code/ofertaSUPER-refresh"
LOG_DIR="$HOME/.local/state/ofertasuper"

mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/refresh-$(date +%F).log"
exec >>"$LOG" 2>&1
echo "=== entry started $(date -Is) ==="

# Cron runs with a minimal PATH: pin the stable fnm node directory (the alias,
# not the ephemeral multishell) plus the well-known system directories.
export PATH="$HOME/.local/share/fnm/aliases/default/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"

for cmd in docker npm gh git; do
  if ! command -v "$cmd" > /dev/null; then
    echo "required command not found in PATH: $cmd"
    exit 1
  fi
done

# The dedicated worktree is the only thing this entry point ever adds.
if [ ! -d "$REFRESH_WORKTREE" ]; then
  git -C "$MAIN_WORKTREE" worktree add --detach "$REFRESH_WORKTREE" origin/master
fi

git -C "$REFRESH_WORKTREE" fetch origin
git -C "$REFRESH_WORKTREE" checkout --detach origin/master
git -C "$REFRESH_WORKTREE" clean -fdq data artifacts/refresh

exec "$REFRESH_WORKTREE/scripts/cron-refresh.sh"
