# Proposal: Production Dependency Security Closure on Next.js 16

## Intent

Close the production dependency audit through a reversible Next.js 16.3.1 migration coordinating fixed production packages. Preserve authentication, catalog, PWA installation/cache/offline fallback, images, builds, standalone runtime, and public availability; never attribute unrelated findings to Next.js.

## Scope

### In Scope
- Own PR 0's bounded dependency-gate/foundation baseline and evidence required by Graph.
- Move `next`, `@next/env`, and `eslint-config-next` together to 16.3.1; coordinate compatible fixed production dependencies.
- Migrate `src/middleware.ts` to `src/proxy.ts` without changing Clerk authorization.
- Retain `next build --webpack` while the PWA plugin injects webpack configuration.
- Prove audit, browser, PWA/offline, image, build, and standalone behavior.
- Deliver five reversible auto-chained slices—PR 0 Foundation, Graph, Proxy, PWA, Runtime—each below 400 authored lines.

### Out of Scope
- PWA/Turbopack replacement unless required to preserve behavior.
- Cache Components, PPR, Server Actions, AMP, runtime config, React upgrades, UI redesign, or image-host hardening.
- This change may deliver shared foundation files and evidence but MUST NOT edit or mark `production-readiness` task state complete; that change consumes evidence independently.

## Capabilities

### New Capabilities
- `production-runtime-security`: Coordinated dependency remediation, Next.js 16 runtime continuity, audit evidence, rollback, and uninterrupted deployment.

### Modified Capabilities
- None. Existing `production-operational-control` remains unchanged and consumes the evidence separately.

## Approach

Gate the five slices in order. Retain Node 22.19, TypeScript 5.9, React 19.2, caching, standalone output, and PWA integration unless incompatibility requires correction.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `package*.json`, foundation tests/scripts | Modified | Baseline and graph |
| `src/middleware.ts`, `src/proxy.ts`, admin | Modified | Proxy and Clerk behavior |
| `next.config.ts`, `public/`, images | Modified | PWA/offline/image boundary |
| `Dockerfile`, workflows, tests | Modified | Runtime and audit proof |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| PWA plugin conflicts with Turbopack | High | Keep `--webpack`; verify offline production |
| Peer ranges hide runtime regressions | Medium | Exercise auth, Proxy, catalog, browser |
| Residual findings are obscured | High | Classify every dependency path |

## Rollback Plan

Retain the last verified deployment and cut over only after gated proof. On any critical authentication, catalog, PWA, image, build, or standalone regression, restore the prior lock, build, and deployment without public interruption.

## Dependencies

- Compatible fixed releases and production-like browser/standalone verification.

## Success Criteria

- [ ] A later `npm audit --omit=dev --json` MUST prove zero production findings across Next.js, Clerk, Prisma, Axios, and every other production dependency; risk acceptance is not a success substitute.
- [ ] Authentication, catalog, PWA/offline, images, Webpack build, and standalone runtime pass production-like proof.
- [ ] Deployment is interruption-free and rollback is rehearsed.
