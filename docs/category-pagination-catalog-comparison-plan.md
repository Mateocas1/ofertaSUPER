# Category-pagination catalog comparison tooling plan

Status: proposed for review  
Issue: [#318](https://github.com/Mateocas1/ofertaSUPER/issues/318)  
Scope: documentation only

## Decision

Build the next tooling slice as a source-scoped, read-only comparison between category-pagination audit candidates and the current catalog identity set. The purpose is to estimate known coverage, likely discovery opportunities, duplicates, and identity conflicts before spending more live-request budget or introducing any write-capable discovery flow.

This plan does not authorize implementation, DB writes, discovery apply, scheduler execution, all-source execution, production writes, deploys, migrations, cache purge, or full catalog claims.

## Inputs

| Input | Role | Required guard |
| --- | --- | --- |
| Category-pagination artifact | Public candidate denominator for one `source + issue + surface`. | Must be under `audit/coverage/issue-<issue>/<source>/category-pagination/`. |
| Catalog identity snapshot | Current known source/product identities for the same source. | Read-only query or reviewed exported fixture; source-scoped only. |
| Source config snapshot | Confirms the source slug, host, and adapter boundary used by the audit. | Must match the artifact source. |

## Matching policy

Match conservatively and fail closed on ambiguity.

| Match key | Use | Caveat |
| --- | --- | --- |
| `source + skuId` | Strongest source-local match when present in both sets. | Must not cross source boundaries. |
| `source + productUrl` | Useful when SKU is missing but public URL is stable. | Normalize host/path before matching. |
| `source + ean` | Useful fallback for product identity. | EAN collisions or missing EAN require conflict/unmatched status, not writes. |
| Canonical candidate key | Last-resort deterministic grouping for report stability. | Report-only; not a create key. |

## Output metrics

The comparison report should be artifact-only and include:

- total candidates from the category-pagination artifact;
- known candidates already represented in the catalog snapshot;
- likely missing candidates not found in the catalog snapshot;
- duplicate candidates inside the audit artifact;
- ambiguous/conflicting candidates by key type;
- unmatched rows with insufficient identity;
- stale input warnings when artifact timestamps or snapshot timestamps are outside the approved window;
- source, issue, surface, artifact path, command options, and generated timestamp.

## Safety boundaries

- Run one source per issue. No all-source execution.
- Read one approved category-pagination artifact at a time.
- Treat catalog access as read-only; exported fixture mode is preferred for first implementation if DB-read posture is not yet reviewed.
- Never create, update, delete, hide, or inactivate products.
- Never turn likely missing candidates into discovery apply input without a separate approved prewrite gate.
- Confidence must remain bounded to the compared artifact and snapshot window.

## First implementation slice

Start with a fixture-backed CLI for one reviewed artifact and one source. The first source should be Vea because it has complete baseline, wider, deeper, and offset evidence with strong yield.

Suggested first report shape:

```text
source: vea
surface: category-pagination
candidateArtifact: audit/coverage/issue-295/vea/category-pagination/category-pagination-audit.json
catalogSnapshot: audit/catalog-snapshots/issue-<issue>/vea/catalog-identities.json
metrics:
  totalCandidates
  knownCandidates
  likelyMissingCandidates
  duplicateCandidates
  conflictCandidates
  insufficientIdentityRows
confidence:
  status: PASS | WARN | FAIL
  reasons: []
```

## What this still will not prove

- Full public catalog coverage or internal supermarket catalog completeness.
- Discovery create/apply safety.
- Production write safety.
- Scheduler or all-source readiness.
- Freshness cadence or update throughput.

The report only answers: “For this bounded artifact and this source-scoped catalog snapshot, how many public candidates appear known, likely missing, duplicate, ambiguous, or insufficiently identified?”
