# Consumer MVP blocker registry

This durable registry records only observed blockers affecting consumer-MVP work. Its template starts empty; records are added only when observed. Do not invent entries to fill the template.

## Operating policy

A blocker is durable when it prevents a lane from producing trustworthy evidence or safely continuing. The parent assigns an ID, records evidence, groups any required human decision in the orchestration inbox, and updates status as evidence changes.

Independent work may continue only when its prerequisites, scope, credentials, and evidence are unaffected by the blocker. `unknown` dependency impact pauses the lane; it is not independent by default.

## Schema

| Field | Required content |
|---|---|
| `id` | Stable identifier, for example `B-CMVP-001`. |
| `title` | Concise observed impediment. |
| `category` | `decision`, `credential`, `bug`, `dependency`, `external`, or `verification`. |
| `severity` | `local`, `milestone`, or `program`. |
| `status` | `open`, `investigating`, `waiting-human`, `mitigated`, `resolved`, or `wont-fix`. |
| `affected_lanes` | Named lanes/units, or `unknown` while impact is being investigated. |
| `evidence` | Exact paths, commands, timestamps, or returned facts; never speculation. |
| `owner` | Parent or explicitly assigned human role. |
| `next_action` | Smallest evidence-producing action or closed human decision. |
| `updated_at` | ISO 8601 timestamp. |
| `resolution` | Required when terminal: observed outcome and follow-up boundary. |

## Status lifecycle

`open` → `investigating` → `waiting-human` or `mitigated` → `resolved` / `wont-fix`.

Use `waiting-human` only for an actual decision or unavailable authorization. Use `mitigated` only when a bounded workaround permits stated lanes to continue; the original evidence remains. `resolved` requires observed verification. `wont-fix` requires an explicit scope decision and records the resulting exclusion.

## Entries

### B-CMVP-002 — Supabase recovery/export connectivity is unavailable

| Field | Content |
|---|---|
| `id` | `B-CMVP-002` |
| `title` | Supabase recovery/export connectivity is unavailable |
| `category` | `credential` |
| `severity` | `local` |
| `status` | `mitigated` |
| `affected_lanes` | Temporary Supabase recovery/export follow-up only; it does not block CMVP-03 or pending `CMVP-03-T3` local PostgreSQL bootstrap and fixture/seed-to-snapshot proof. |
| `evidence` | Two authorized strictly read-only attempts were observed. The first had `DATABASE_URL` absent from the process. The second privately supplied the existing environment and failed with `PrismaClientInitializationError` without an error code. Neither attempt obtained DB access or results; no secrets were exposed and no writes occurred. |
| `owner` | Parent / authorized environment maintainer |
| `next_action` | Preserve Supabase until backup/export parity is observed; when separately authorized, perform a bounded recovery/export connectivity check. Do not upgrade to Pro, treat connectivity as verified, or make it a CMVP-03 prerequisite. |
| `updated_at` | `2026-09-19T06:22:44+00:00` |
| `resolution` | Not terminal. The bounded recovery/export follow-up remains; connectivity is neither verified nor resolved. |

### B-CMVP-003 — CMVP local bootstrap seed image/client generation

| Field | Content |
|---|---|
| `id` | `B-CMVP-003` |
| `title` | CMVP local bootstrap seed image/client generation |
| `category` | `bug` |
| `severity` | `local` |
| `status` | `resolved` |
| `affected_lanes` | CMVP-03-T3 is closed. This resolution does not establish CMVP-03 completion, authorize live acquisition, or authorize CMVP-04/T4. |
| `evidence` | Behavior-first focused RED observed 2 pass/1 fail because the Dockerfile lacked `FROM dependencies AS seeder`. GREEN passed 3/3 after a narrow seeder target copied Prisma, ran `db:generate`, and switched only `seed.build.target`. Independent offline focused checks (3/3), typecheck, `lint --quiet`, and diff-check passed. Authorized `npm run bootstrap:cmvp-local` succeeded with seed exit 0. Existing-seed rerun `docker compose up --build --abort-on-container-exit --exit-code-from seed seed` also succeeded with exit 0 without cleanup. Safe checks observed exactly Carrefour, Disco, and Jumbo. A read-only `SET LOCAL ROLE ofertasuper_app` transaction selected counts from `categories`, `products`, `supermarkets`, `supermarket_products`, `price_history`, `promotions`, and `promotion_products`; effective app-role checks for schema CREATE, role administration, database creation, superuser, RLS bypass, and database CREATE privilege were all false. No objects or data were mutated. An initial role `postgres` check failed because that role does not exist; configured-owner checks subsequently passed. Final status: PostgreSQL healthy/running; role-provision, migrate, grants, and seed exited 0; network `ofertasuper-cmvp-local-bootstrap_default` is bridge with PostgreSQL attached; volume `ofertasuper-cmvp-local-bootstrap_postgres-data` is local and retained. |
| `owner` | Parent |
| `next_action` | None for this blocker. Keep CMVP-03 open until its remaining broader acceptance and fixture/seed-to-snapshot proof are observed; do not start T4. |
| `updated_at` | `2026-09-19T07:11:34+00:00` |
| `resolution` | Resolved by observed source correction and runtime verification. No cleanup/down/volumes/prune, Supabase, source probes, ingestion, T4, commit/push/review, or secret exposure occurred. |

### B-CMVP-004 — VTEX adapter execution blocker resolved by successful isolated applicable execution

| Field | Content |
|---|---|
| `id` | `B-CMVP-004` |
| `title` | VTEX adapter execution blocker resolved by successful isolated applicable execution |
| `category` | `bug` |
| `severity` | `milestone` |
| `status` | `resolved` |
| `affected_lanes` | None. Historical impact was `CMVP-03-T4b-3` Disco → Jumbo → Carrefour sequential first-batch execution. |
| `evidence` | At `2026-09-19T21:26:00Z`, the exactly one authorized public Disco persisted-query health request through `probeVtexHash` completed under isolated runtime conditions with private-hash presence and both DB URL variables absent (booleans only). It classified `hash_invalid`, with `isHealthy: false`, `hashValid: false`, `productsReturned: 0`, and a redacted response time. The temporary container was confirmed removed. Redacted artifact: `artifacts/cmvp/first-batch/2026-09-19T21-23-09Z/disco/disco-persisted-query-health.json` (SHA-256 `586bd8e519e2c0ac9a2989d88216383740b5eed0b5116d30ff2983f3675822bb`). No preview, ingestion, database access/write, fallback, or continuation was executed. On `2026-09-19T18:07:01Z`, the existing source-adapter bounded preview failed before a public request because `VTEX_SHA256_HASH` was absent from the runtime process. On `2026-09-19T18:10:02Z`, the user explicitly authorized reopening `B-CMVP-004` and `CMVP-03-T4b-3`, and authorized loading only `VTEX_SHA256_HASH` from the named private local environment file into each required runtime process. The former approved CLI imported `scripts/load-env`, which could load `DATABASE_URL` or `DIRECT_URL` from that private file; that conflict stopped acquisition before any request. The environment-isolation correction is approved and native lineage `review-ce3e0faec399747b` is acknowledged. At `2026-09-19T20:35:24Z`, resume preflight statically confirmed the corrected approved CLI has no environment-file loader import or invocation. The local PostgreSQL container is healthy but exposes no host port, and no already-running CLI-capable local process was available with the required explicit app-role connection. Establishing one would require an unapproved Docker runtime/lifecycle action. At `2026-09-19T20:39:52Z`, the user explicitly authorized the minimal local Docker runtime bridge: one temporary `docker compose run --rm` container on the existing compose network, no host port or service/image/compose/volume lifecycle change, read-only authoritative worktree with only approved first-batch artifacts writable, explicit local app-role connection, `DIRECT_URL` unset, and private extraction of only `VTEX_SHA256_HASH`. Acquisition is authorized after its isolation/connectivity preflight. At `2026-09-19T20:43:48Z`, the equivalent temporary network-attached runtime passed isolation and app-role connectivity preflight with read-only worktree, writable approved artifact mount, `DIRECT_URL` absent, and only private VTEX presence reported; its redacted artifacts are `artifacts/cmvp/first-batch/2026-09-19T20-39-52Z/runtime-preflight.json` (SHA-256 `13fabd977c1e618c6e49209e8bb6efe28be95c910314d5012f6efc1bf1f98d69`) and removal receipt (SHA-256 `98eb4a1972b8712d3089797c710288b2f5f5b5da3deecea7dc01c62f913b8e79`). The single bounded Disco preview with term `leche` and count `5` then exited nonzero without a diagnostic; no dry-run or write followed, and public-request completion is unknown. Its redacted error receipt is `artifacts/cmvp/first-batch/2026-09-19T20-39-52Z/disco/preview-error.json` (SHA-256 `35a73c3e202341dad2263713ffef3f4b751c4b3b425228ec058c567a956d7c43`); its temporary-container removal receipt is SHA-256 `2cff0e69926b39a3e3f7285ee4f1f08a2d5cde613a98c4cebf5c885720204e12`. This source is stopped before any additional request or write. At `2026-09-19T20:53:21Z`, the user authorized exactly one diagnosable retry through `getSourceAdapter("disco").fetchProducts(["leche"], {count:5})` only, using a sanitizing wrapper and the already authorized temporary isolated runtime. The retry may privately extract only `VTEX_SHA256_HASH`, must set explicit app-role `DATABASE_URL` with `DIRECT_URL` unset, and can write only fresh redacted first-batch evidence. No alternate scraper/writer or second retry is authorized. The one retry started its public request with count 5 under the required isolation, then exited 1 with sanitized `VtexRequestError` / `adapter_failure`; it produced no valid normalized GTINs. No dry-run, confirmed write, database verification, Jumbo, or Carrefour action followed. Fresh evidence: `artifacts/cmvp/first-batch/2026-09-19T20-55-10Z/disco/disco-diagnostic.json` (SHA-256 `b9018b9ee2ea9131d0d1831c32c074c8e410f043de536a9fe6ea4762d42d4924`) and container removal receipt `artifacts/cmvp/first-batch/2026-09-19T20-55-10Z/disco/container-removal.json` (SHA-256 `a237be0cb38ffbd996920438ed7b6f0233e8c42e08e61cf336e7715f4c3bc905`). Redacted evidence: `artifacts/cmvp/first-batch/2026-09-19T20-35-24Z/runtime-connectivity-blocker.json` (SHA-256 `a1537671acbc51b28cd38c73ef08f02a65765fd01cba0f5c5927d3612f132403`). Earlier evidence: `artifacts/cmvp/first-batch/2026-09-19T18-10-47Z/preflight-safety-blocker.json` (SHA-256 `b8a335c5018fc4137208a11fe08c7c57925e00daee0f0f7dbcd6e5f08d3f0722`). Final observed isolated applicable execution succeeded: two sequential cycles passed with all sources, 100% freshness, 167 exact comparables, and identical target fingerprint `1b7fe874958e9f6798ec76fa2e6115858c6bafcd785468bf357638cf52140fc0`; cycle 2 reported `consecutiveSuccessful: true`. |
| `owner` | Parent / authorized environment maintainer |
| `next_action` | None. CMVP-03 acceptance is complete; CMVP-04 is the next step and has not started. |
| `updated_at` | Final execution timestamp was not included in the observed reconciliation evidence. |
| `resolution` | Resolved by successful isolated applicable execution. The historical failed health/preview/diagnostic outcomes remain recorded above. The two final sequential cycles each had 36 checkpoints, with 29 completed and 7 correctly fail-closed; those seven fail-closed batch outcomes are informational safety behavior, not an unresolved blocker. |

### B-CMVP-001 — Authorization required to prepare the authoritative delivery line

| Field | Content |
|---|---|
| `id` | `B-CMVP-001` |
| `title` | Authorization required to prepare the authoritative delivery line |
| `category` | `decision` |
| `severity` | `milestone` |
| `status` | `resolved` |
| `affected_lanes` | `CMVP-02`, authoritative branch/worktree preparation |
| `evidence` | The user granted B-CMVP-001 authorization to prepare the target branch/worktree and transplant CMVP planning/orchestration documentation. The prepared authoritative line is `feat/consumer-mvp-reset` at `a62540b`, with `origin/master` as an ancestor. Its baseline verification passed: `npm test` 99 pass/0 fail/12 skip, typecheck pass, lint 0 errors/195 pre-existing warnings, and shell-helper checks pass. |
| `owner` | Parent / authorized human |
| `next_action` | None; CMVP-02 is closed. CMVP-03 remains open, with T1/T2 complete and T3 pending. |
| `updated_at` | `2026-09-19T05:49:51+00:00` |
| `resolution` | Authorization was granted and the target branch/worktree was prepared. The documented reconciliation acceptance and baseline checks were observed, so this authorization blocker is resolved; CMVP-03-T1/T2 evidence and pending T3 do not establish live-catalog readiness. |
