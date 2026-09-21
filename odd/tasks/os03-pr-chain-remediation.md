# OS03 PR Chain Remediation

Goal: make PRs #467–#478 independently reviewable and green before U15, without rewriting published history or changing OS03 behavior.

- [ ] **R1 — Refactor bounded recent complexity**
  - [ ] Reduce `admitStrictRateLimit` in PR #471 without changing admission semantics.
  - [ ] Reduce `immutableHostname` and `validatePinnedDeployment` in PR #472 without weakening provider/provenance checks.
  - [ ] Reduce `correctionIdentity` and `prepareForwardCorrection` in PR #477 without weakening fail-closed correction or verifier freshness.
  - [ ] Run focused tests and complexity audit at each owning slice.
- [ ] **R2 — Register historical checkpoint debt**
  - [ ] Add exact, temporary complexity exceptions in PR #475 only for U11–U13 symbols that cannot be safely refactored during delivery remediation.
  - [ ] Bind every exception to existing focused tests, exact metrics/ceilings, named ownership/review, expiry, and concrete review/removal triggers.
  - [ ] Run every canonical exception test command and the complexity audit.
- [ ] **R3 — Restore Vercel build compatibility**
  - [ ] Reproduce the missing `.next/next-server.js.nft.json` failure boundary.
  - [ ] Preserve the Next 16.3.1 Turbopack + Serwist build while retaining the NFT artifact required by Vercel `onBuildComplete`.
  - [ ] Verify local build output contract and production build.
- [ ] **R4 — Propagate without rewriting**
  - [ ] Commit each correction on its earliest owning PR branch.
  - [ ] Merge each corrected parent forward through all descendants; do not force-push or rewrite reviewed commits.
  - [ ] Confirm every immediate-parent PR diff remains focused and all four authorized `size:exception` labels remain intact.
- [ ] **R5 — Remote closure**
  - [ ] Confirm issue linkage and exactly one `type:*` label per PR.
  - [ ] Confirm complexity, Vercel, Lighthouse, and repository policy checks are green across #467–#478.
  - [ ] Confirm `feat/os03-12-forward-correction-publication` is the clean base for U15.
