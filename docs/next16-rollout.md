# Next.js 16 Runtime Rollout Rehearsal

## Preconditions

Build the standalone runner image and run the bounded rehearsal:

```bash
docker build --target runner -t ofertas-super:next16 .
npm run smoke:next16-runtime
```

The rehearsal derives two local, distinct immutable image digests from the locally built runner, starts retained and candidate `node server.js` containers on separate loopback-only ports, and puts a bounded loopback HTTP selector in front of them. It proves retained catalog availability through that selector before cutover, switches to candidate exactly once, then proves candidate catalog availability and protected denial through the same selector.

## Registry Access Boundary

For reproducible builds, Docker registry metadata/auth resolution and image pulls are permitted as read-only activity when explicitly authorized by the maintainer. Pushes, publication, registry or provider configuration mutation, and credential exposure remain forbidden. If read-only registry access occurs, the evidence MUST disclose it; it is not equivalent to local-only execution.

The catalog receipt records its route, status, non-empty item count, response shape, provenance, snapshot, release image, and observation time. The rehearsal rejects absent, malformed, empty, stale, or mixed snapshot/release catalog evidence. The containers have no network access and use an invalid local database URL, so a successful isolated rehearsal records `demo` provenance; it is never database-backed catalog proof.

## Recovery boundary

The rehearsal injects a bounded candidate `SIGKILL` after post-cutover smoke. It detects the unavailable candidate through the selector, switches exactly once back to retained, and re-proves catalog availability. Missing references, equal digests, stale or mixed release evidence, incomplete smoke, selector ambiguity, a repeated rollback, malformed input, or secret-bearing data fail closed. It removes only its named containers and derived images; it never changes provider traffic or deployment state.

## Evidence handoff

Each rehearsal writes immutable pre-switch, post-switch, recovery, selector, promotion, handoff, and manifest records under `audit/next16-rollout/<snapshot-id>/<rehearsal-id>/`. The manifest binds the snapshot, both release digests, selector event sequence, failure evidence, rollback count, final selection, cleanup outcome, and record hashes. `handoff.json` always identifies `production-readiness` task `1.3` as `pending`; that change owns its task state and promotion decision.

## Promotion gates

`promotion-state.json` is atomically persisted before a promotion decision returns or rejects. It requires one current, passed, snapshot- and release-bound receipt for dependency audit/graph, build, standalone liveness, standalone catalog provenance, protected denial, authorized access, PWA install/cache/offline, representative image, and rollback readiness. Missing, failed, stale, mixed, duplicate, unknown, malformed, or secret-bearing receipts fail closed.

The bounded local rehearsal consumes the S2 liveness, catalog, and protected-denial schemas plus the S3 promotion/handoff schema. Promotion remains `blocked` because S5 authorized-access and the other release-bound gates are absent, while the isolated selector rehearsal truthfully records its rolled-back local state. The handoff lists failed and missing gate identities, a deterministic state hash, and task `1.3` as `pending` for every `blocked`, `rolled_back`, and `promoted` state.

Run the authorized one-shot only as `NEXT16_S5_TARGET=development NEXT16_S5_CONFIRMATION=NEXT16_S5_DEVELOPMENT_CONFIRMED npm run smoke:next16-authorized`; the confirmation is per-run and is not a package script value. It requires one synthetic-admin marker, discovers supported Clerk commands/endpoints, keeps credentials in isolated Playwright memory, records only hashes/categories, revokes the session/token, rejects production/ambiguity, and changes no users, roles, configuration, or deployment state.
