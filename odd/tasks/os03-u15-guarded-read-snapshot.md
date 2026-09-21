# OS03 U15 — Guarded Read Snapshot

## Goal

Provide one server-only primitive that authorizes and reads the governed catalog projection from a single primary-database `REPEATABLE READ` snapshot. A successful read returns an immutable authority decision whose absolute deadline is no later than 30 seconds after the authoritative check and no later than the authority expiry.

OpenSpec artifacts are historical input only. This ODD checklist is the execution record.

## Scope

- Exact configured serving identity; no latest-publication fallback.
- Authority, reader adoption, restriction, manifest, health, build, generation, lineage, and policy checks inside the same snapshot as projection reads.
- Governed `serving_*` projection only; mutable source tables are forbidden.
- Distinguish authority unavailability from legitimate commercial absence.
- Fail closed before emission when the immutable decision deadline has passed.

## Non-goals

- U16 API, basket, and shared-loader migration.
- U17 page, metadata, JSON-LD, and sitemap enforcement.
- U18 payload/cache/client/PWA enforcement.
- U19 acceptance harness and operational runbook.

## Tasks

- [x] **U15-T1 — Define guarded decision and snapshot contracts**
  - Add immutable internal DTOs for exact authority bindings, projection reads, unavailable outcomes, and absolute decision deadlines.
  - Prove invalid identity/bindings/manifest/health/restriction fail closed and no latest-promoted lookup exists.
- [ ] **U15-T2 — Implement one guarded repeatable-read boundary**
  - Authorize and read `serving_*` through one primary-database `REPEATABLE READ` transaction.
  - Prove multi-query detail/history/count/ranking observations cannot mix generations and never access mutable source tables.
- [ ] **U15-T3 — Enforce bounded decision reuse and pre-emission checks**
  - Install a decision only after a successful timely snapshot; cap its absolute lifetime at 30 seconds and authority expiry.
  - Prove failures cannot create or extend a lease, slow snapshots cannot install one, and expired decisions deny emission.
- [ ] **U15-T4 — Verify and close the unit**
  - Run focused unit and disposable PostgreSQL proofs, full tests, typecheck, lint, complexity audit, build, and diff checks.
  - Complete independent verification and native review before commit/push.

## Current state

Authorized automatically by the user's prior instruction after PRs #467–#478 became green and all human-owned worktrees were clean. Exploration completed; implementation has not started.
