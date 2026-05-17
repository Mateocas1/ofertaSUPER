Prepare ofertasSUPER for continuity readiness, not production readiness: audit Supabase/Prisma/env, validate a controlled VTEX/ingestion path, run a
  minimal public smoke, update handoff/runbook, and leave verifiable evidence without adding new features or running build.

  Context:
  - Main repo: `C:\Users\picala\Documents\ofertasSUPER`.
  - Do not touch `ofertasas`, `test-kimi`, portfolio/CV/LinkedIn.
  - Home visual slice is already closed and must not be redesigned.
  - This goal must prepare safe continuity only. Do NOT claim production-ready/deploy-ready.

  Strict contracts:
  - No `npm run build`.
  - No production-ready/deploy claims.
  - No new UI redesign.
  - No new product/canasta/admin features unless required to make an existing smoke verifiable.
  - No DB writes unless explicitly part of a dry-run-safe command or separately approved.
  - No active ingestion mode.
  - Stop if working tree has unexpected changes.
  - Conventional commits only.
  - No Co-Authored-By or AI attribution.
  - If logic changes, TDD: failing test first, then implementation.

  Gate 0 — Repo safety:
  - Confirm repo root.
  - Confirm `git status --short`.
  - Confirm no unexpected background/dev process from prior runs.
  - Confirm `.env` and `.env.local` are ignored; do not print secrets.

  Gate 1 — Supabase/Prisma/env contract:
  - Inspect `prisma/schema.prisma`.
  - Inspect migrations under `prisma/migrations`.
  - Inspect `prisma/seed.ts`.
  - Compare required env keys from `.env.example` against code usage without exposing secret values.
  - Run `npx prisma validate`.
  - If DB is reachable, optionally run read-only Prisma/migration status checks.
  - Document DB-available and DB-unavailable behavior separately.

  Gate 2 — Controlled VTEX/ingestion:
  - First run safe VTEX probe only:
    `npm run probe:vtex -- --source=disco --query=leche --count=1`
  - Only if safe and necessary, run:
    `npm run ingest -- --dry-run --source=disco --limit=1`
  - Explicitly document that ingest dry-run still reads Supabase and may fetch more than one product because stage count defaults to 50.
  - Do not run `INGESTION_V2=active`.
  - Do not run multi-source ingestion unless explicitly approved.

  Gate 3 — Public smoke:
  - Start local dev server on isolated port.
  - Verify:
    - `/`
    - `/buscar?q=leche`
    - `/api/search?q=yerba&limit=1`
  - For product/canasta smoke:
    - discover a real sample from API first;
    - if no sample exists, document gate as not closed instead of faking success.
  - Confirm no visible 500, Prisma overlay, or claim regression.

  Gate 4 — Tests:
  - `npm test`
  - `npm run typecheck`
  - `npm run lint`
  - Do not run build.

  Gate 5 — Docs and audit:
  - Update `docs/handoff.md`.
  - Update or create a continuity runbook if current docs are stale.
  - Include prompt-to-artifact audit:
    - what was requested;
    - which file/commit covers it;
    - which command verified it;
    - what remains pending;
    - what was intentionally not touched.
  - Explicitly list production-readiness blockers still open, especially build/PWA if still out of scope.

  Delegation policy:
  - Delegation allowed only for bounded tasks.
  - Read-only audits may be parallel:
    - Supabase/Prisma/env audit;
    - ingestion/scripts audit;
    - smoke plan audit;
    - docs/handoff audit.
  - Write tasks must have one owner and one clear file scope.
  - Main agent must review diffs and run final verification locally.

  Completion criteria:
  - Working tree clean.
  - Work-unit commits, conventional messages.
  - Tests/typecheck/lint pass.
  - Smoke evidence captured.
  - Handoff/runbook updated.
  - No inflated claims.
  - Remaining blockers explicit.
