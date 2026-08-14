## Exploration: Next.js 16 security migration

### Current State

The working tree contains unrelated, in-progress `production-readiness` work and remains preserved. The manifest and lockfile candidate declare and lock `next`, `@next/env`, and `eslint-config-next` at `15.5.23`, while the installed tree remains at `15.5.14`; `npm ls --depth=0 --json` therefore reports those three packages as invalid against the candidate manifest. Installed React and React DOM are `19.2.4`, Clerk is `7.0.6`, TypeScript is `5.9.3`, ESLint is `9.39.4`, and Node is `22.19.0`.

The current production audit remains `2 critical`, `21 high`, `3 moderate`, and `3 low`. npm attributes the `next`, Next-nested `postcss`, and Next-optional `sharp` finding family to the `next@16.3.1` fix. A Next.js upgrade does not resolve the two critical Clerk entries, Clerk's related highs, direct `axios`, direct `prisma`, Prisma's `@prisma/config`/`effect`/`defu` chain, or tooling chains included in the production graph through root dependency `shadcn`. Next.js 16 removes the framework blocker but cannot independently make `production-readiness` task 1.3 green.

#### Exact-package documentation evidence

The published `next@16.3.1` package was downloaded and extracted only under `/tmp/opencode/next-16.3.1-docs.MZkyXA/node_modules/next/`. Its package version was verified as `16.3.1`, and the archive SHA-512 matched npm's published integrity value `sha512-hsAp0i7Rh+/dhe7DGIeN2YlpLM1DP4MNxti9EtDMtqcO612X81MvvEj388/oTce9U1EcEIOWDlGq0zRwrBKvuA==`.

The following exact package files were read completely:

- `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`
- `node_modules/next/dist/docs/01-app/02-guides/upgrading/codemods.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/middleware.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/08-turbopack.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/turbopack.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/images.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/09-revalidating.md`
- `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md`
- `node_modules/next/dist/docs/01-app/02-guides/how-revalidation-works.md`
- `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`
- `node_modules/next/dist/docs/01-app/02-guides/offline-support.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-offline.md`
- `node_modules/next/dist/docs/01-app/02-guides/testing/index.md`
- `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md`
- `node_modules/next/dist/docs/01-app/02-guides/production-checklist.md`
- `node_modules/next/dist/docs/01-app/02-guides/self-hosting.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/17-deploying.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/02-typescript.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/03-eslint.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md`
- `node_modules/next/package.json`

Cleanup succeeded after the evidence was incorporated: `/tmp/opencode/next-16.3.1-docs.MZkyXA`, its `next-16.3.1.tgz`, and the extracted `node_modules/next/dist/docs/` no longer exist. Repository status after cleanup matched the pre-read status apart from this exploration artifact.

#### Deterministic Next.js 16 requirements

- **Runtime minimums are already satisfied:** Next.js 16 requires Node `20.9+` and TypeScript `5.1+`; the repository uses Node 22.19.0 and TypeScript 5.9.3. The exact package accepts React/React DOM `^19.0.0`; current 19.2.4 is compatible and matches the guide's React 19.2 baseline. No React change is required by this migration.
- **Paired packages must move together:** `next`, `@next/env`, and `eslint-config-next` must use the exact 16.3.1 candidate. Clerk must also move outside its vulnerable `7.0.0-7.2.3` range; `7.2.4+` metadata accepts Next.js 16 and React 19.2.x, but runtime compatibility still requires proof.
- **`middleware` is deprecated and must be migrated for a clean 16.x result:** rename `src/middleware.ts` to `src/proxy.ts`. A default export is supported, the matcher syntax remains valid, Proxy uses the Node.js runtime, and Proxy runtime configuration is not allowed. The existing file declares no Edge runtime, so no runtime-preservation exception applies.
- **Turbopack becomes the default for `next dev` and `next build`:** the installed `@ducanh2912/next-pwa` source adds a `webpack` configuration and uses `workbox-webpack-plugin`. Exact Next.js docs state that `next build` fails when a custom/plugin-added webpack configuration is present unless the project migrates it or opts into `--webpack`. The bounded migration must initially retain PWA behavior and change the production build command to `next build --webpack`; replacing the PWA integration with a Turbopack-compatible implementation is a later, separately justified migration.
- **Async Request APIs are mandatory:** synchronous `params`, `searchParams`, `cookies()`, `headers()`, and `draftMode()` access is removed. Repository pages and route handlers already type and await `params`/`searchParams`, and no `next/headers` usage was found, so no source conversion is currently required. `next typegen` plus typecheck must prove this after the upgrade.
- **Existing caching model remains valid:** the repository does not enable `cacheComponents` and uses statically analyzable `export const revalidate = 21600`. Exact docs preserve this previous caching model. Enabling Cache Components is not a rename-only migration and is out of scope.
- **Standalone output remains supported:** `output: "standalone"` still emits `.next/standalone/server.js`; public and `.next/static` remain manual copy inputs. The Dockerfile already follows that documented model, so proof is required but no deterministic Docker change is identified.
- **ESLint CLI is already used:** `next lint` is removed, but the repository invokes `eslint .` and already has flat config. Exact 16.3.1 docs prefer direct flat-config imports from `eslint-config-next/core-web-vitals` and `/typescript`; replacing `FlatCompat` is recommended compatibility cleanup, not a prerequisite inferred without a lint run.

#### Non-applicable or test-only surfaces

- No Server Actions, `revalidateTag`, `updateTag`, `cacheLife`, `cacheTag`, `unstable_cache`, PPR, Cache Components, parallel-route slots, AMP, runtime config, or removed dev-indicator options were found. Their Next.js 16 changes do not require migration work.
- The PWA's static `public/manifest.json` remains supported. Next.js's experimental `useOffline` does not provide full offline reloads and does not replace the existing service worker; adopting it is out of scope.
- All current `next/image` consumers use `unoptimized` and do not pass custom quality or local query-string URLs. New optimizer defaults for TTL, qualities, redirects, and local-IP blocking therefore require regression checks but no deterministic source change. The broad HTTPS `remotePatterns` wildcard remains a separate security-hardening concern.
- Exact docs recommend production-environment E2E testing for async Server Components and `next build && next start` for offline behavior. The repository has no browser E2E suite, so unit/type/lint success alone is insufficient migration proof.

Relationship to `production-readiness`: this change must deliver a reviewed Next.js 16 candidate and exact post-migration evidence that task 1.3 can consume. It MUST NOT mark task 1.3 complete. That task remains pending until its own gate records zero critical findings and every high finding fixed or covered by valid signed, scoped, expiring acceptance; task 1.4 remains downstream and separate.

### Affected Areas

- `package.json`, `package-lock.json` — exact paired Next.js candidate, fixed Clerk candidate, Webpack build opt-out, and audit graph.
- `src/middleware.ts` → `src/proxy.ts` — deterministic convention migration while preserving Clerk matcher behavior.
- `next.config.ts` — PWA's webpack injection, standalone output, security headers, and image configuration.
- `src/lib/admin/access.ts`, `src/app/admin/**`, `src/app/api/admin/**` — Clerk server APIs and defense-in-depth authorization requiring runtime proof.
- `src/app/**` — App Router route generation, async route inputs, metadata, route handlers, and the retained previous caching model.
- `src/components/{product-card,search-bar,canasta-page}.tsx` — unoptimized remote `next/image` behavior.
- `public/manifest.json`, `public/sw.js`, `public/workbox-*.js`, `src/app/~offline/page.tsx` — generated PWA assets, registration, update behavior, and offline fallback.
- `eslint.config.mjs`, `tsconfig.json`, `next-env.d.ts` — flat ESLint integration, route type generation, and generated Next.js types.
- `Dockerfile`, `.github/workflows/lighthouse-ci.yml` — Webpack production build, standalone image, production startup, and Lighthouse proof.
- `tests/production-dependency-gate.test.ts` — currently hard-codes 15.5.23 and must distinguish Next-family remediation from the full production gate.
- Existing tests plus new browser/proxy/PWA contracts — current coverage does not prove Proxy matching, authenticated Clerk behavior, service-worker updates, offline reloads, or async Server Components in production.

### Approaches

1. **Direct 16.3.1 migration with immediate Turbopack/PWA replacement** — upgrade dependencies, rename Proxy, and replace the webpack-oriented PWA integration in one migration.
   - Pros: Reaches the Next.js 16 default bundler immediately and removes the webpack opt-out.
   - Cons: Couples security remediation to a service-worker architecture replacement, enlarges rollback scope, and exceeds the evidence currently available for preserving offline behavior.
   - Effort: High

2. **Staged 16.3.1 migration retaining Webpack production builds** — add contracts, upgrade the coordinated dependency set, migrate Middleware to Proxy, retain current PWA behavior through documented `--webpack`, and prove production/browser behavior before handing evidence to `production-readiness`.
   - Pros: Applies deterministic requirements, isolates PWA modernization, preserves current offline intent, provides autonomous rollback boundaries, and fits `auto-chain` review limits.
   - Cons: Production builds temporarily remain on Webpack and require an explicit later decision before adopting Turbopack for PWA builds.
   - Effort: Medium-High

3. **Temporary risk acceptance** — retain 15.5.23 and accept the unresolved findings.
   - Pros: Avoids immediate framework changes.
   - Cons: Rejected because vulnerable code remains, the maintainer selected migration, and acceptance cannot silently satisfy the fail-closed production gate.
   - Effort: Low implementation effort, High residual risk

### Recommendation

Use **staged 16.3.1 migration retaining Webpack production builds**. This is the smallest exact-doc-supported path that removes the Next.js major-version blocker without combining it with a PWA rewrite. Keep `next dev` on the Next.js 16 default, use `next build --webpack` while `@ducanh2912/next-pwa` remains, and treat Turbopack-compatible PWA replacement as a separate future change.

Recommended autonomous review slices, each below 400 authored changed lines and independently revertible:

1. **Compatibility contracts and exact candidate**
   - Prerequisites: preserve the worktree; retain the current audit receipt; use exact 16.3.1 docs; predeclare the Next-family versus full-gate distinction.
   - Boundary: RED contracts for paired versions, fixed Clerk range, Proxy convention, async route APIs, explicit Webpack production build, and residual-audit classification; then update only the coordinated manifests and generated lockfile.
   - Rollback: revert only candidate manifest/lockfile and migration-contract changes to the retained 15.5.23 state.
   - Proof: `npm ls next @next/env eslint-config-next @clerk/nextjs react react-dom`; `npm audit --omit=dev --json`; focused dependency tests; confirm Next/PostCSS/Sharp and Clerk critical findings are gone while reporting unrelated residuals honestly.

2. **Proxy and framework integration**
   - Prerequisites: slice 1 tree is valid; Clerk candidate APIs compile; no Edge-runtime requirement appears.
   - Boundary: rename `src/middleware.ts` to `src/proxy.ts`, preserve the matcher and defense-in-depth authorization, adopt direct ESLint flat imports if required by lint, and make only type/build-proven App Router corrections.
   - Rollback: revert Proxy/config/type changes without mixing PWA behavior or dependency rollback.
   - Proof: Proxy matcher tests using `next/experimental/testing/server`; admin policy tests; `npx next typegen`; `npm run typecheck`; `npm run lint`.

3. **PWA, images, and production build**
   - Prerequisites: slices 1-2 green; explicit retention of current PWA/offline behavior; production build script uses `--webpack`.
   - Boundary: keep `@ducanh2912/next-pwa`, add focused contracts for manifest/service-worker generation, service-worker no-cache/security headers, offline fallback, and unoptimized image behavior. Do not adopt experimental `useOffline` or replace the PWA stack.
   - Rollback: revert PWA/image contracts and any bounded header correction; retain the core framework migration if production build remains valid, otherwise revert the chain.
   - Proof: `npm run build`; start the production server; browser-check service-worker registration/update, `/~offline`, manifest, and representative remote images; verify offline behavior against the production build, not dev mode.

4. **Standalone runtime and evidence handoff**
   - Prerequisites: slices 1-3 green; Docker operational; a production-like browser flow is available.
   - Boundary: minimal E2E/smoke evidence for public dynamic routes, metadata, route handlers, protected admin paths, PWA/offline behavior, standalone startup, and residual audit attribution. Do not edit `production-readiness` task completion here.
   - Rollback: revert only smoke/evidence additions; revert the full migration chain if security, standalone, or user-visible behavior fails.
   - Proof: `npm test`; `npm run typecheck`; `npm run lint`; `npm run build`; production `next start` browser E2E; `npm run lighthouse`; `docker build --target runner -t ofertas-super:next16 .`; container liveness and representative route checks; final `npm audit --omit=dev --json`.

Generated lockfile and PWA assets may exceed 400 lines, but generated size remains visible in review and snapshot identity. Authored source, tests, configuration, and documentation in every slice must remain below 400 changed lines. No `size:exception` is recommended.

### Risks

- The retained PWA plugin injects webpack configuration, so default Next.js 16 production Turbopack is incompatible until the PWA integration is replaced; the explicit `--webpack` boundary must not be removed accidentally.
- Clerk's peer range proves install compatibility, not request interception or authenticated-session behavior; Proxy and live browser evidence remain mandatory.
- The installed repository tree remains 15.5.14 until implementation, so no current test/build can prove the 16.3.1 candidate.
- Next.js 16 removes only the Next/PostCSS/Sharp audit family; unrelated Clerk, Prisma, Axios, Shadcn/tooling, and transitive findings must remain visible to task 1.3.
- Existing unit tests do not prove async Server Components, production navigation, service-worker update semantics, offline reloads, or optimized-image behavior.
- Wildcard remote image hosts and absent service-worker-specific cache/CSP headers are security-hardening risks, not automatic framework migration changes.
- Generated PWA files and lockfile churn can obscure authored changes unless reviewed as separate generated evidence.
- Unrelated working-tree changes make broad resets, lockfile regeneration without inspection, or mixed commits unsafe.

### Ready for Proposal

**Yes.** The exact-documentation blocker is resolved, no product decision blocks proposal work, and the recommended migration boundary is explicit: Next.js 16.3.1 with a fixed compatible Clerk release, deterministic Middleware-to-Proxy migration, retained React 19.2.4 and previous caching model, Webpack production builds while the current PWA plugin remains, and separately bounded runtime/security proof. The proposal must keep `production-readiness` task 1.3 pending until that change consumes the final audit evidence.
