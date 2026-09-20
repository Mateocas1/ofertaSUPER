#!/usr/bin/env bash
# Read-only Stage A helper for CMVP Herdr-assisted orchestration.
# It never starts agents, mutates Herdr/Git state, or manages worktrees.

set -u
set -o pipefail

readonly REQUIRED_HERDR_VERSION="herdr 0.9.0"
readonly UNIT="CMVP-02"

usage() {
  cat <<'EOF'
Usage: scripts/orchestration/consumer-mvp-herdr.sh <command> [argument]

Read-only Stage A helper for Consumer MVP orchestration.

Commands:
  help                 Show this help.
  doctor               Check Git repository and Herdr 0.9.0 prerequisites.
  plan CMVP-02         Render the deterministic read-only reconciliation lane plan.

Safety boundary:
  This helper only reads prerequisite and topology information. It never starts
  agents, creates/removes worktrees, merges, commits, pushes, answers prompts,
  or mutates Herdr or Git state.
EOF
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  return 1
}

require_prerequisites() {
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    fail "run inside a Git worktree"
    return 1
  fi

  if ! command -v herdr >/dev/null 2>&1; then
    fail "Herdr is required; expected ${REQUIRED_HERDR_VERSION}"
    return 1
  fi

  local version
  if ! version="$(herdr --version 2>/dev/null)"; then
    fail "could not read Herdr version"
    return 1
  fi
  if [[ "$version" != "$REQUIRED_HERDR_VERSION" ]]; then
    fail "expected ${REQUIRED_HERDR_VERSION}; observed ${version}"
    return 1
  fi
}

doctor() {
  require_prerequisites || return 1

  local root branch worktrees
  root="$(git rev-parse --show-toplevel)" || return 1
  branch="$(git branch --show-current)" || return 1
  worktrees="$(git worktree list --porcelain | awk '/^worktree / { count++ } END { print count + 0 }')" || return 1

  printf 'CMVP Stage A doctor: PASS\n'
  printf 'repository: %s\n' "$root"
  printf 'branch: %s\n' "${branch:-detached}"
  printf 'herdr: %s\n' "$REQUIRED_HERDR_VERSION"
  printf 'registered_worktrees: %s\n' "$worktrees"
  printf 'mode: read-only; no Herdr session, agent, or worktree action was requested\n'
}

plan() {
  if [[ "${1:-}" != "$UNIT" || $# -ne 1 ]]; then
    fail "plan requires exactly: plan ${UNIT}"
    return 1
  fi
  require_prerequisites || return 1

  cat <<'EOF'
CMVP-02 lane plan (DRY RUN; no agents started)
initial_concurrency: 3 read-only scouts

1. cmvp02-delivery-line [scout, read-only]
   inspect: origin/master, current branch, and delivery claims
2. cmvp02-os03-worktrees [scout, read-only]
   inspect: OS03, active branches, and worktree relationships
3. cmvp02-openspec-claims [scout, read-only]
   inspect: OpenSpec changes and conflicting completion claims

join gate: parent classifies all scout evidence, blockers, and decisions
then: one isolated reconciliation writer with an explicit allowed edit surface
then: one independent verifier after the writer reports a bounded candidate
integrator: human-authorized only; no automatic merge, commit, push, or deletion
EOF
}

case "${1:-help}" in
  help|-h|--help)
    if [[ $# -ne 1 ]]; then
      fail "help accepts no arguments"
      exit 1
    fi
    usage
    ;;
  doctor)
    if [[ $# -ne 1 ]]; then
      fail "doctor accepts no arguments"
      exit 1
    fi
    doctor
    ;;
  plan)
    shift
    plan "$@"
    ;;
  *)
    fail "unknown command: $1"
    usage >&2
    exit 1
    ;;
esac
