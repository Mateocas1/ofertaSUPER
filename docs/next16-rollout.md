# Next.js 16 Runtime Rollout Rehearsal

## Preconditions

Build the standalone runner image and run the bounded rehearsal:

```bash
docker build --target runner -t ofertas-super:next16 .
npm run smoke:next16-runtime
```

The rehearsal starts retained and candidate containers on private Docker networks and sends requests from inside each container. It requires a `200` public liveness response and an authentication response (`302`, `303`, `307`, `308`, `401`, or `403`) from `/admin`. Missing proof blocks promotion before any cutover decision.

## Recovery boundary

The rehearsal retains the previous container until candidate liveness and protected-route proof pass. A failure, timeout, or signal records one return to the retained release and removes only containers named by the rehearsal. It does not rebuild, switch public traffic, remove unrelated containers, or prune Docker resources.

## Evidence handoff

Each successful rehearsal writes `runtime.json`, `handoff.json`, and `manifest.json` once under `audit/next16-rollout/<snapshot-id>/<rehearsal-id>/`. The manifest binds the runner image ID, package lock, and record hashes. `handoff.json` always identifies `production-readiness` task `1.3` as `pending`; that change owns its task state and promotion decision.
