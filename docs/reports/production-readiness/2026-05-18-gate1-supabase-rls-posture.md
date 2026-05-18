# Gate 1 - Supabase/RLS security posture - 2026-05-18

Status: `GREEN`

Supabase/Prisma connectivity is healthy and the RLS posture finding was remediated after explicit user approval (`autorizo`). SQL was applied to revoke broad `anon`/`authenticated` access and enable RLS on the application tables. Post-apply verification confirms the original issue no longer reproduces.

## What changed since the previous checkpoint

- The old Prisma `P1001` direct-host blocker is resolved locally.
- `.env` and `.env.local` use Supavisor session pooler on port `5432` for `DIRECT_URL`.
- The RLS remediation proposal was applied after explicit approval.
- 11 public tables now have RLS enabled.
- `anon` and `authenticated` no longer have table grants on the audited application tables.
- Public sequence `USAGE` grants to `anon` and `authenticated` were removed.

## Evidence commands

| Check | Result | Evidence |
|---|---|---|
| `npx prisma validate --schema prisma/schema.prisma` | Passed before apply. Schema is valid. | terminal output in session |
| `npx prisma migrate status --schema prisma/schema.prisma` | Passed after apply. 4 migrations found; database schema is up to date. | `2026-05-18-gate1-post-rls-prisma-migrate-status.log` |
| Pre-apply direct RLS/grants query | Confirmed 11 public tables with `rls_enabled=false`, no policies, and broad grants to `anon`/`authenticated`. | `2026-05-18-gate1-rls-grants-snapshot.json` |
| Pre-apply sequence query | Confirmed 8 public sequences granted `USAGE` to `anon`/`authenticated`. | `2026-05-18-gate1-sequence-grants-snapshot.json` |
| SQL apply transcript | 25 statements executed successfully one-by-one. | `2026-05-18-gate1-rls-apply-transcript.md` |
| Post-apply direct RLS/grants query | 11/11 audited tables have `rls_enabled=true`; grants to `anon`/`authenticated` are empty; policies remain empty intentionally. | `2026-05-18-gate1-rls-grants-post-apply.json` |
| Post-apply sequence query | No public sequence usage grants remain for `anon`/`authenticated`. | `2026-05-18-gate1-sequence-grants-post-apply.json` |
| Supabase security advisors post-apply | CLI printed `No issues found`. | `2026-05-18-gate1-supabase-security-advisors-post-apply.txt` |
| `npm test` | Passed: 21/21. | `2026-05-18-gate1-post-rls-npm-test.log` |
| `npm run typecheck` | Passed. | `2026-05-18-gate1-post-rls-typecheck.log` |
| `npm run lint` | Passed. | `2026-05-18-gate1-post-rls-lint.log` |
| Post-RLS local public smoke | Passed for `/`, `/api/search?q=yerba&limit=1`, `/buscar?q=leche`. | `2026-05-18-gate1-post-rls-smoke.json` |

## Evidence files

- `docs/reports/production-readiness/2026-05-18-gate1-supabase-security-advisors.txt`
- `docs/reports/production-readiness/2026-05-18-gate1-rls-grants-query.sql`
- `docs/reports/production-readiness/2026-05-18-gate1-rls-grants-snapshot.json`
- `docs/reports/production-readiness/2026-05-18-gate1-sequence-grants-query.sql`
- `docs/reports/production-readiness/2026-05-18-gate1-sequence-grants-snapshot.json`
- `docs/reports/production-readiness/2026-05-18-gate1-rls-remediation-proposal.sql`
- `docs/reports/production-readiness/2026-05-18-gate1-rls-apply-transcript.md`
- `docs/reports/production-readiness/2026-05-18-gate1-rls-grants-post-apply.json`
- `docs/reports/production-readiness/2026-05-18-gate1-sequence-grants-post-apply.json`
- `docs/reports/production-readiness/2026-05-18-gate1-supabase-security-advisors-post-apply.txt`
- `docs/reports/production-readiness/2026-05-18-gate1-post-rls-prisma-migrate-status.log`
- `docs/reports/production-readiness/2026-05-18-gate1-post-rls-npm-test.log`
- `docs/reports/production-readiness/2026-05-18-gate1-post-rls-typecheck.log`
- `docs/reports/production-readiness/2026-05-18-gate1-post-rls-lint.log`
- `docs/reports/production-readiness/2026-05-18-gate1-post-rls-smoke.json`
- `docs/reports/production-readiness/2026-05-18-gate1-smoke-dev.stdout.log`
- `docs/reports/production-readiness/2026-05-18-gate1-smoke-dev.stderr.log`

## Original finding

Before remediation, these tables were in schema `public`, had RLS disabled, had no policies, and granted broad privileges to both `anon` and `authenticated` roles:

- `public._prisma_migrations`
- `public.categories`
- `public.ingestion_run`
- `public.price_history`
- `public.products`
- `public.promotion_products`
- `public.promotions`
- `public.source_health`
- `public.staging_product`
- `public.supermarket_products`
- `public.supermarkets`

The pre-apply snapshot showed table privileges including `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, and `TRIGGER` on each listed table.

## App access model observed in code

- Runtime DB access goes through `src/lib/db.ts` and Prisma.
- No browser Supabase client usage was found in app/source scripts.
- Public APIs are Next.js API routes backed by server-side code, not direct Supabase PostgREST calls from the browser.

This is why the conservative lock-down keeps the current server-side Prisma path working while removing direct PostgREST-facing access for `anon` and `authenticated`.

## Remediation applied

The SQL in `2026-05-18-gate1-rls-remediation-proposal.sql` was applied after approval.

High-level effect:

1. Revoked all table privileges from `anon` and `authenticated` on the listed application tables.
2. Revoked sequence usage from `anon` and `authenticated` on public sequences.
3. Enabled RLS on the listed tables.
4. Did not create public policies, because the current app does not use direct browser Supabase table access.

## Post-apply caveats

- Future direct Supabase browser/client access will need explicit policies before it can read/write these tables.
- The current server-side Prisma app path remained healthy in post-apply smoke.
- This gate does not by itself prove Vercel production envs or GitHub Actions secrets are configured; those are later phases.

## Gate decision

Status: `GREEN`.

The original RLS/grants issue was reproduced with direct DB metadata queries, remediated after approval, and verified with post-apply metadata queries plus Prisma/tests/typecheck/lint/public smoke.
