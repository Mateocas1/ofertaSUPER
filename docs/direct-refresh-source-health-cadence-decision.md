# Technical decision: source-health gating and freshness recovery

Status: accepted for planning
Date: 2026-06-05
Issue: [#154](https://github.com/Mateocas1/ofertaSUPER/issues/154)

This decision defines how direct-refresh should interpret source health while moving from controlled one-off pilots to real freshness recovery.

It does not authorize scheduler execution, production writes, all-source operation, repeated batches, DIA writes, VTEX scans, manifest/prewrite generation, notifications, deploys, secrets changes, remote config changes, or cache purge.

## Context

Direct-refresh has completed:

- `count=50` controlled write pilots for Carrefour, Vea, Disco, Jumbo, and MAS;
- minimal read-only dry-run evidence chains for the same five writer-supported sources;
- a gated Vea dry-run proving non-PASS optional evidence fails closed;
- a writer-supported source-health snapshot showing all five writer-supported sources are currently `WARN` because freshness is below target.

The current problem is semantic: freshness debt and safety risk are both surfaced as non-PASS source-health. If freshness debt is treated as an absolute hard stop, the system cannot recover freshness because stale sources are blocked from refresh planning.

## Decision

Separate source-health interpretation into three dimensions and one combined eligibility result.

| Field | Meaning | Planning behavior |
| --- | --- | --- |
| `safetyStatus` | Whether the source/work unit is safe to consider. | `BLOCKED` stops all write-producing phases and scheduler/cadence execution. |
| `freshnessStatus` | Whether the source has freshness debt. | Debt is input to recovery planning, not write authorization. |
| `capacityStatus` | Whether the source can likely fill planned batches safely. | `PASS` normal; `WARN` reduced/manual-review planning; `FAIL` hard stop. |
| `runEligibility` | Phase-specific combined decision. | Controls whether diagnosis, recovery planning, manifest/prewrite, or active write may proceed. |

Accepted policy choices:

1. Use a dual freshness roadmap:
   - recovery target: `80%` freshness within `24h`;
   - final production target: `95%` freshness within `12h`.
2. Target writer-supported sources first: Carrefour, Vea, Disco, Jumbo, MAS.
3. Keep DIA as `audit-only-no-writer` until a separate approved hardening decision changes that posture.
4. Allow freshness-only WARN to enter recovery planning if safety is PASS.
5. Treat capacity WARN as a reduced-batch/manual-review condition, not automatic authorization.
6. Treat capacity FAIL as a blocker.
7. Make the first cadence slice evidence-only/read-only, using DB/audit evidence only.

## Hard-stop blockers

The following block write-producing phases and any future cadence/scheduler execution:

- source/global kill switch active;
- source inactive;
- required source type mismatch, e.g. non-VTEX where VTEX is required;
- invalid source URL or host drift;
- DIA selected as writer-supported source;
- missing, malformed, stale, or mismatched issue/source/count/attempt evidence;
- wrong or missing `status:approved` issue metadata;
- more than one `type:*` label;
- active conflicting run or unknown staging/ingestion state;
- capacity FAIL;
- alert policy hard stop, including critical/high alert conditions once alert evidence is part of the phase;
- prewrite FAIL, stale prewrite, or prewrite rerun drift;
- confirmation mismatch;
- EAN mismatch;
- SKU mismatch;
- direct lookup ambiguity;
- direct lookup zero products for selected row;
- non-positive live price for selected row;
- price delta outside approved threshold;
- no-create invariant risk or violation;
- postwrite FAIL;
- unresolved no-partial verification after a stopped/failed attempt;
- database/advisory lock unavailable once run ledger locking exists;
- request for scheduler execution, automatic writes, all-source mode, repeated batches, notifications, deploy, secrets, remote config, or cache purge outside separate approval.

## Freshness debt is not a bypass

Freshness debt may start a recovery plan. It does not skip any gate.

A future recovery operation still requires:

1. approved source/count-specific issue;
2. safety checks;
3. capacity-aware plan;
4. fresh manifest and prewrite PASS;
5. exact human confirmation;
6. one source/count/run;
7. write report;
8. postwrite audit PASS;
9. freshness baseline;
10. evidence comment and closure only when complete.

## Capacity WARN behavior

Capacity WARN means the source may still be refreshable, but the plan must be conservative.

Allowed planning responses:

- reduce batch size;
- increase evidence confidence requirements;
- require manual review before manifest/prewrite;
- require larger candidate scan only in a separately approved VTEX/direct-read evidence slice;
- exclude source temporarily from recovery plan if blocker density is too high;
- keep MAS in rapid-confirmation protocol for large batches.

Default normal-readiness policy still requires capacity `PASS`. Capacity `WARN` / `mixed` maps to `manual-review`, not `ready-for-human-confirmation`. A future operation that proceeds from manual review must have a separate approved issue that explicitly accepts the mixed-capacity risk, limits selection to rows that passed fresh capacity evidence, and preserves all normal manifest, prewrite, exact confirmation, postwrite, and no-partial controls.

Disallowed responses:

- treating capacity WARN as automatic write approval;
- presenting mixed capacity as normal operation readiness;
- hiding skipped/blocked rows;
- using all-source or repeated-batch execution to compensate for poor fill rate;
- relaxing identity, host, price, no-create, or postwrite checks.

## Artifact lineage and TTL

Every future planning artifact must include:

- issue number and URL;
- source;
- count or proposed count;
- attempt ID;
- output directory;
- parent artifact paths;
- parent artifact hashes where applicable;
- `generatedAt`;
- TTL policy for each input artifact;
- explicit blocked modes;
- DIA posture;
- dry-run/write boundary.

Mismatched lineage fails closed. Stale evidence fails closed for the phase that depends on that evidence.

Recommended initial TTL policy for design/testing:

| Artifact | Initial TTL policy |
| --- | --- |
| Kill switch | Must be checked at plan time and immediately before write-producing phases. |
| Source health | Fresh enough for planning only; rerun before manifest/prewrite when used as a safety gate. |
| Capacity report | Planning evidence only; must show generation time and confidence. |
| Manifest | Phase-local; cannot authorize write. |
| Prewrite | Existing 15-minute freshness window remains hard stop. |
| Alerts | Must be regenerated or explicitly accepted within the attempt. |
| Operations report | Summary only; cannot authorize write by itself. |
| Baseline | Observation only unless generated after postwrite PASS. |

## Race conditions

| Race | Mitigation |
| --- | --- |
| Kill switch changes after planning | Re-check before each write-producing phase. |
| Source status changes after planning | Planning is advisory; phase gates rerun before writes. |
| Concurrent runs choose overlapping rows | Add run ledger and source-scoped advisory lock before repeated/cadence execution. |
| Human confirmation arrives after prewrite TTL | Stop and regenerate prewrite; require new confirmation. |
| Prewrite rerun selects different rows | Stop; new evidence and new confirmation required. |
| Baseline runs while write is in flight | Baseline after postwrite PASS only, or mark as observational. |
| Artifact path from another attempt is supplied | Fail closed on lineage mismatch. |
| DIA appears in aggregate reports | Allowed as audit-only; never count as writer-supported freshness recovery. |
| Denominator changes during recovery | Planner records denominator timestamp; final baseline decides result. |
| VTEX rate limit emerges mid-plan | Stop source and require hardening/backoff policy before continuing. |
| Prisma pool exhaustion or transaction timeout recurs | Stop and fix concurrency/timeout before retry. |

## Performance implications

`count=50` proves contract safety, not sustained freshness.

Latest writer-supported source-health snapshot shows this best-case lower bound:

| Target | Minimum selected rows | Minimum source-scoped `count=50` batches |
| --- | ---: | ---: |
| 80%/24h recovery | 3,235 | 67 |
| 95%/12h final | 3,843 | 78 |

These are lower bounds calculated as the sum of per-source batch ceilings. Real execution may need more because of skipped rows, stale aging during the recovery window, VTEX anti-bot behavior, rate limits, MAS scan density, manual confirmation latency, and database contention.

Therefore the next implementation must model cadence, budget, and windows before running repeated refresh operations.

## Consequences

Positive:

- avoids the stale-source circular blocker;
- keeps hard safety stops intact;
- supports real freshness planning without pretending scheduler readiness;
- preserves DIA exclusion clarity;
- creates a production-shaped path instead of a throwaway MVP.

Tradeoffs:

- docs and reports must become more explicit than a single PASS/WARN/FAIL field;
- some existing wording must be superseded or clarified;
- future tests must cover eligibility dimensions and lineage mismatches;
- real freshness remains blocked until cadence planning and execution controls exist.

## Next slice

Issue [#156](https://github.com/Mateocas1/ofertaSUPER/issues/156) implements `audit:direct-refresh-freshness-debt-planner` as read-only/evidence-only.

Issue [#158](https://github.com/Mateocas1/ofertaSUPER/issues/158) adds the run ledger and source advisory lock foundation required before any repeated-batch or cadence execution.

Issue [#160](https://github.com/Mateocas1/ofertaSUPER/issues/160) adds the cadence controller foundation as read-only/control-plane planning that consumes planner and ledger evidence, models source/count posture, and stops at a human confirmation boundary.

The planner, ledger foundation, and cadence controller foundation must not run VTEX scans, manifest, prewrite, active writer, scheduler, notifications, deploy, secrets, remote config, cache purge, all-source mode, repeated batches, or DIA writes.
