# Direct-refresh dry-run evidence chain

Use this guide to produce read-only direct-refresh planning evidence for one approved source/count work unit. The chain helps an operator review readiness before manual gates, but it does not authorize scheduler execution, manifest/prewrite generation, active writes, all-source operation, repeated batches, or DIA writes.

## Quick path

1. Produce a disabled scheduler planner report.
2. Feed that planner report into the operations report.
3. Feed both reports, plus any supplied source-health/alert/kill-switch evidence, into the dry-run orchestrator report.
4. Post the resulting artifact paths and conclusion on the approved issue.

## Required inputs

| Input | Rule |
|---|---|
| Issue | Approved GitHub issue with exactly one `type:*` label and `status:approved`. |
| Source | One writer-supported source only: `carrefour`, `vea`, `disco`, `jumbo`, or `mas`. |
| Count | One allowlisted count only: `10`, `25`, or `50`. |
| Output directory | One source/count/attempt-specific directory under `audit/`. |
| Optional supplied evidence | Existing source-health, alerts, kill-switch, and operations-report JSON artifacts. |

DIA is excluded from writer-supported direct-refresh and must not be used as the active dry-run source.

## Example command sequence

Set the shared values first:

```bash
SOURCE=vea
COUNT=50
ISSUE_NUMBER=142
ISSUE_URL=https://github.com/Mateocas1/ofertaSUPER/issues/142
ISSUE_TITLE="docs(data): document direct-refresh dry-run evidence chain"
ATTEMPT=$(date -u +%Y%m%dT%H%M%SZ)
OUT_DIR=audit/${SOURCE}-direct-refresh-dry-run-count${COUNT}/${ATTEMPT}
```

### 1. Scheduler planner

```bash
npm run audit:direct-refresh-scheduler-planner -- \
  --planning-enabled=true \
  --source=${SOURCE} \
  --count=${COUNT} \
  --issue-url=${ISSUE_URL} \
  --issue-number=${ISSUE_NUMBER} \
  --issue-title="${ISSUE_TITLE}" \
  --issue-type-label=type:docs \
  --issue-approval-label=status:approved \
  --output=${OUT_DIR}/scheduler-plan.json
```

Expected result:

- `status: "PASS"` means the planner produced read-only guidance only.
- `status: "FAIL"` means stop and fix the listed fail-closed reasons.
- No scheduler, manifest/prewrite, or writer command is executed.

### 2. Operations report with planner evidence

```bash
npm run audit:direct-refresh-operations-report -- \
  --source=${SOURCE} \
  --scheduler-planner=${OUT_DIR}/scheduler-plan.json \
  --output=${OUT_DIR}/operations-report.json
```

Optional evidence can be supplied when available. Append these flags before `--output`:

```bash
  --source-health=audit/direct-refresh-source-health/manual/source-health-report.json \
  --alerts=audit/direct-refresh-alerts/manual/alerts-report.json \
  --kill-switch=audit/direct-refresh-kill-switch/manual/kill-switch-report.json \
```

Expected result:

- Missing scheduler planner evidence is optional for generic operations reporting, but this chain should supply it.
- Malformed or non-PASS planner evidence fails closed as an operations-report blocker.
- Scheduler, all-source operation, repeated batches, production writes, notifications, and DIA writer support remain blocked.

### 3. Dry-run orchestrator report

```bash
npm run audit:direct-refresh-dry-run-orchestrator -- \
  --dry-run=true \
  --source=${SOURCE} \
  --count=${COUNT} \
  --issue-url=${ISSUE_URL} \
  --issue-number=${ISSUE_NUMBER} \
  --issue-title="${ISSUE_TITLE}" \
  --issue-type-label=type:docs \
  --issue-approval-label=status:approved \
  --scheduler-planner=${OUT_DIR}/scheduler-plan.json \
  --operations-report=${OUT_DIR}/operations-report.json \
  --output=${OUT_DIR}/dry-run-orchestrator.json
```

Add supplied read-only gate evidence if available. Append these flags before `--output`:

```bash
  --source-health=audit/direct-refresh-source-health/manual/source-health-report.json \
  --alerts=audit/direct-refresh-alerts/manual/alerts-report.json \
  --kill-switch=audit/direct-refresh-kill-switch/manual/kill-switch-report.json \
```

Expected result:

- `status: "PASS"` means the supplied read-only evidence is internally consistent for this source/count work unit.
- `status: "FAIL"` means stop. Do not generate manifest/prewrite and do not request writer confirmation.
- The dry-run orchestrator reads supplied artifacts only; it does not run planner, source health, alerts, kill switch, operations report, manifest, prewrite, or active writer commands.

## Stop rules

Stop immediately if any artifact reports or implies:

- source/count mismatch;
- missing `status:approved` issue metadata;
- DIA as active source;
- non-PASS scheduler planner, source health, alerts, kill switch, or operations report evidence;
- malformed supplied artifact;
- scheduler execution, manifest/prewrite generation, active writer invocation, all-source mode, repeated batches, retry automation, notification delivery, deploy, secrets, cache purge, or remote config intent.

A failed dry-run can be retried only after fixing the read-only evidence and rerunning the chain. It is not a production incident and does not authorize a write retry.

## Evidence comment template

```md
## Direct-refresh dry-run evidence

- Issue:
- Source/count:
- Scheduler planner: `audit/<source>-direct-refresh-dry-run-count<count>/<attempt>/scheduler-plan.json`
- Operations report: `audit/<source>-direct-refresh-dry-run-count<count>/<attempt>/operations-report.json`
- Dry-run orchestrator: `audit/<source>-direct-refresh-dry-run-count<count>/<attempt>/dry-run-orchestrator.json`
- Optional source health:
- Optional alerts:
- Optional kill switch:
- Conclusion: PASS/FAIL
- Stop condition, if any:
- Next manual action:

This evidence is read-only guidance only. It does not authorize scheduler execution, manifest/prewrite generation, active writes, all-source operation, repeated batches, or DIA writes.
```

## What this enables

This guide enables repeatable operator evidence for one source/count dry-run review. It does not change the production posture: direct-refresh remains controlled manual source-specific operation until a future scheduler issue and PR are separately approved, merged, configured, and explicitly enabled by humans.
