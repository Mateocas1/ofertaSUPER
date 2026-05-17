# ofertasSUPER continuity readiness runbook

This checkpoint prepares the project for safe continuation. It is not a production-ready or deploy-ready sign-off.

## Quick path for the next session

1. Confirm repo safety:
   - `git rev-parse --show-toplevel`
   - `git status --short`
   - verify `.env` and `.env.local` remain ignored.
2. Validate local contracts without exposing secrets:
   - `npx prisma validate --schema prisma/schema.prisma`
   - inspect `.env.example` keys against code usage.
3. If VTEX needs a tiny live check, start with:
   - `npm run probe:vtex -- --source=disco --query=leche --count=1`
4. If ingestion needs a controlled dry-run, use only:
   - `INGESTION_V2=shadow npm run ingest -- --dry-run --source=disco --limit=1`
5. Run public smoke on an isolated dev port, then finish with:
   - `npm test`
   - `npm run typecheck`
   - `npm run lint`

Do not run `npm run build` in this continuity-readiness scope.

## Gate evidence

| Gate | Evidence | Result |
|---|---|---|
| Repo safety | `git rev-parse --show-toplevel`, `git status --short`, `git check-ignore -v .env .env.local` | Repo root confirmed. Only untracked file was `goal.md`, the explicit input artifact. `.env` and `.env.local` are ignored; `.env.example` is tracked. |
| Background process check | `Get-CimInstance Win32_Process` filtered for dev ports/processes | No unexpected dev Node process found before smoke. |
| Prisma schema | `npx prisma validate --schema prisma/schema.prisma` | Exit 0, schema valid. Prisma warns `package.json#prisma` config is deprecated for Prisma 7. |
| Migration status | `npx prisma migrate status --schema prisma/schema.prisma` | Exit 1 with P1001: direct host `db.gbpgqhasveytpptxsztw.supabase.co:5432` not reachable. Treat direct/admin DB path as not closed. |
| Supabase network split | `Test-NetConnection` direct host and pooler host | Direct host name resolution failed; regional pooler `aws-1-sa-east-1.pooler.supabase.com:6543` accepts TCP. |
| VTEX tiny probe | `npm run probe:vtex -- --source=disco --query=leche --count=1` | Exit 0, `isHealthy=true`, `hashValid=true`, `productsReturned=1`. |
| Ingestion dry-run | `INGESTION_V2=shadow npm run ingest -- --dry-run --source=disco --limit=1` | Exit 0, `sourceCount=1`, `fetched=6`, `staged=6`, `promoted=0`, `failedSources=0`. |
| Public smoke | Dev server on `127.0.0.1:3035` | `/`, `/buscar?q=leche`, `/api/search?q=yerba&limit=1`, `/producto/7790710334757`, `/canasta` returned 200 without visible framework/Prisma error. |

Raw evidence snapshot: `docs/reports/readiness/continuity-readiness-2026-05-17.json`.

Screenshots captured:

- `docs/screenshots/readiness-home-2026-05-17.png`
- `docs/screenshots/readiness-search-2026-05-17.png`

## Supabase / Prisma contract

### Schema surfaces

`prisma/schema.prisma` currently defines these persisted surfaces:

- catalog: `Supermarket`, `Product`, `SupermarketProduct`, `PriceHistory`, `Category`;
- commercial signals: `Promotion`, `PromotionProduct`;
- ingestion: `IngestionRun`, `StagingProduct`, `SourceHealth`.

### Migration files

- `prisma/migrations/20260320_init/migration.sql`
- `prisma/migrations/20260322_ingestion_sprint1/migration.sql`
- `prisma/migrations/20260322_price_history_avg_idx/migration.sql`
- `prisma/migrations/20260322_staging_unlogged/migration.sql`

### Seed behavior

`prisma/seed.ts` upserts supermarkets from `src/lib/supermarkets.ts`. It does not seed a full product catalog.

### Env contract

Tracked template: `.env.example`.
Ignored local secret files: `.env`, `.env.local`.

Important notes:

- `DATABASE_URL` is the runtime/pooler path.
- `DIRECT_URL` is the migration/admin path.
- Clerk keys may not appear as direct `process.env.*` references because the Clerk SDK consumes them by convention.
- `GITHUB_REPOSITORY`, `GITHUB_RUN_ID`, `GITHUB_SERVER_URL`, and `NODE_ENV` are ambient runtime/CI variables, not required local template secrets.
- `RECONCILE_TX_MAX_WAIT_MS`, `RECONCILE_TX_TIMEOUT_MS`, `VTEX_REQUEST_MIN_DELAY_MS`, and `VTEX_REQUEST_MAX_DELAY_MS` are read through helper functions and remain valid `.env.example` entries.

## DB-available vs DB-unavailable behavior

Current evidence is split:

- Runtime/pooler path is usable enough for public smoke and dry-run ingestion.
- Direct/admin path is not closed: `prisma migrate status` cannot reach the direct Supabase host.
- Public routes are protected by fail-open behavior where implemented; `/buscar` and `/api/search` must keep returning useful output instead of Prisma overlays when DB access degrades.

Do not mark Supabase/admin migration readiness closed until direct DB connectivity is fixed and `npx prisma migrate status --schema prisma/schema.prisma` can run successfully.

## Controlled ingestion rules

Safe order:

1. Run `probe:vtex` with `--count=1` first.
2. Only then run one-source dry-run ingestion if needed.
3. Keep `INGESTION_V2=shadow` or default shadow mode.
4. Never use `INGESTION_V2=active` without explicit approval.
5. Never run multi-source ingestion in this gate without explicit approval.

Important gotcha: `npm run ingest -- --dry-run --source=disco --limit=1` limits query terms, not returned products. `stageSourceProducts()` still defaults product `count` to 50, and the verified run fetched/staged 6 products. This is acceptable for a controlled dry-run only because it is one source, one term, dry-run, and no promotion/reconciliation writes occurred.

## Public smoke scope

Closed in this checkpoint:

- home route responds;
- search route responds;
- search API returns an item;
- product detail route responds for discovered EAN `7790710334757`;
- canasta route responds;
- home/search screenshots were captured.

Not closed here:

- authenticated admin E2E;
- deep product comparison E2E;
- canasta with scripted localStorage items;
- active ingestion writes;
- deployment/start/build checks.

## Remaining blockers before production-readiness claims

- Direct Supabase/admin connection must be fixed and migration status must pass.
- Build/PWA remains out of scope here because this goal forbids `npm run build`.
- GitHub secrets were not verified in this local run.
- Clerk production keys/admin auth E2E were not verified.
- Active ingestion was not run.
- Multi-source ingestion was not run.
- Deep E2E for product/canasta/admin/ingestion remains pending.

## Prompt-to-artifact map

| Request | Artifact / evidence |
|---|---|
| Audit Supabase/Prisma/env | This runbook, `prisma/schema.prisma`, migration list, `.env.example` audit, `npx prisma validate`, failed `migrate status` evidence. |
| Validate controlled ingestion | `probe:vtex` result and one-source dry-run evidence in `docs/reports/readiness/continuity-readiness-2026-05-17.json`. |
| Run minimal public smoke | Smoke output in JSON evidence plus screenshots under `docs/screenshots/`. |
| Update handoff/runbook | `docs/continuity-readiness-runbook.md` and `docs/handoff.md`. |
| Leave honest pending gates | Remaining blockers section above. |
| Do not advance features | No app feature code was added for this checkpoint. |
| Do not run build | `npm run build` is listed under `notRun` in evidence. |
