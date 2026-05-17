# FASE 1 Compliance Report

## Scope
This report closes FASE 1 according to [docs/FASE1-INSTRUMENTATION-GUIDE.md](docs/FASE1-INSTRUMENTATION-GUIDE.md), using canonical runs and SQL telemetry evidence.

## Code Instrumentation Status
- Ingestion global/source timing contract is now emitted from [scripts/ingest.ts](scripts/ingest.ts).
- Reconciliation chunk timing is emitted from [scripts/pipeline/reconcile.ts](scripts/pipeline/reconcile.ts).
- SQL telemetry evidence was captured from the database and stored as canonical JSON artifacts in this report folder.

## Canonical Evidence Files
- [docs/reports/fase1/run-shadow-30.json](docs/reports/fase1/run-shadow-30.json)
- [docs/reports/fase1/run-active-during-telemetry.json](docs/reports/fase1/run-active-during-telemetry.json)
- [docs/reports/fase1/run-dryrun-30.json](docs/reports/fase1/run-dryrun-30.json)
- [docs/reports/fase1/telemetry-during-active-1.json](docs/reports/fase1/telemetry-during-active-1.json)
- [docs/reports/fase1/telemetry-during-active-2.json](docs/reports/fase1/telemetry-during-active-2.json)
- [docs/reports/fase1/telemetry-during-active-3.json](docs/reports/fase1/telemetry-during-active-3.json)

## Step 1.1 and 1.3: Runtime Comparison (Same Workload, limit=30)
| Mode | totalPipelineMs | reconcileMs | chunkCount | avgChunkMs | maxChunkMs | fetched | promoted | rejected |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| shadow (real) | 153089 | 0 | 0 | 0 | 0 | 3584 | 0 | 16 |
| active (real) | 403870 | 250740 | 37 | 6763 | 9145 | 3681 | 3669 | 12 |
| active (dry-run) | 18411 | 13936 | 36 | 382 | 425 | 3584 | 3568 | 16 |

Derived signals:
- active/shadow ratio: 2.64x
- active/dry-run ratio: 21.94x
- reconcile dominates active runtime: 62.1% of total pipeline time

Interpretation:
- The main bottleneck is DB write path inside reconcile (real active) rather than fetch/validate.
- Dry-run with same candidate volume stays low in chunk duration, reinforcing that write persistence is the dominant cost.

## Step 1.2: SQL Telemetry During Active Run
From telemetry snapshots captured during the active run:
- lock waits: 0 in all snapshots
- waiting locks (NOT granted): 0 in all snapshots
- active backend sessions observed: 2 to 4
- bloat snapshot (sample):
  - staging_product dead_ratio: 1.92%
  - supermarket_products dead_ratio: 3.9%
  - products dead_ratio: 0.14%

Top queries were available via pg_stat_statements in snapshots (server extension available).

## Step 1.5 Checklist (Filled)
- [x] Shadow runtime: 153089 ms
- [x] Active runtime: 403870 ms
- [x] Dry-run runtime: 18411 ms
- [x] reconcileMs: 250740 ms
- [x] Chunk timings: 37 chunks x 6763 ms/chunk avg
- [x] pg_stat_activity locks: 0 waiting on lock
- [x] Bloat ratio: staging_product 1.92% (below 20%)

## Hypothesis Matrix
| Hypothesis | Status | Evidence |
|---|---|---|
| H1: RTT amplification in reconcile path | Confirmed | reconcileMs very high (250740 ms), chunk timings consistently high (avg 6763 ms, max 9145 ms), active >> shadow/dry-run |
| H2: IOPS throttling on free tier | Probable | Real write path is 21.94x slower than dry-run for same volume; lock contention absent, indicating latency not explained by lock waits |
| H3: Pool exhaustion / connection limit | Not confirmed | No connection-limit errors in these canonical runs, no lock queue growth in telemetry snapshots |

## FASE 1 Conclusion
FASE 1 is completed with required evidence and checklist.

Prioritized next step per plan: proceed to FASE 2.1 (collapse/aggregate reconcile DB writes) because reconcile dominates runtime and the bottleneck is on persistence path, not fetch path.
