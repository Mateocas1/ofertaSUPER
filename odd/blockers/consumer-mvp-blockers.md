# Consumer MVP blocker registry

This durable registry records only observed blockers affecting consumer-MVP work. It intentionally starts empty. Do not invent entries to fill the template.

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

### B-CMVP-001 — Authorization required to prepare the authoritative delivery line

| Field | Content |
|---|---|
| `id` | `B-CMVP-001` |
| `title` | Authorization required to prepare the authoritative delivery line |
| `category` | `decision` |
| `severity` | `milestone` |
| `status` | `waiting-human` |
| `affected_lanes` | `CMVP-02`, authoritative branch/worktree preparation |
| `evidence` | `docs/consumer-mvp-delivery-line-reconciliation.md` records `feat/os03-u16-guarded-catalog-consumers` at `a62540b` as a candidate only. Preparing the line requires creating a branch/worktree and transplanting dirty CMVP documentation, which remains unauthorized. |
| `owner` | Parent / authorized human |
| `next_action` | Authorize creation of one authoritative branch/worktree from the verified candidate base and transplantation of the dirty CMVP planning/orchestration documentation. |
| `updated_at` | `2026-09-19T05:28:25+00:00` |
| `resolution` | Pending human authorization. |
