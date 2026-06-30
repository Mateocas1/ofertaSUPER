# ofertaSUPER CI/CD MVP Implementation Plan

> **For agentic workers:** Required approach: implement this plan task-by-task. Do not broaden scope, do not add deploy secrets, and do not claim CI is green until GitHub Actions passes on the target commit.

**Goal:** Add a minimal GitHub Actions CI workflow to `Mateocas1/ofertaSUPER` that verifies install, lint, type checking, tests, and build.

**Architecture:** This is a validation-only CI workflow. It does not deploy, mutate production data, run scraper jobs, or require secrets. The workflow proves basic engineering hygiene without overengineering the repository.

**Tech Stack:** GitHub Actions, Node.js 20, npm, Next.js, TypeScript, ESLint, Node test runner through `tsx --test`.

---

## Context

Repository: `Mateocas1/ofertaSUPER`  
Default branch observed: `master`  
Implementation branch: `chore/ofertassuper-ci-mvp`

Verified scripts in `package.json`:

```json
{
  "build": "next build",
  "test": "tsx --test tests/**/*.test.ts",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit"
}
```

No workflow was found at `.github/workflows/ci.yml`, `.github/workflows/ci.yaml`, `.github/workflows/build.yml`, or `.github/workflows/tests.yml` when this plan was written.

## Files

- Create: `.github/workflows/ci.yml`
- Read only: `package.json`
- Read only if failures happen: `tests/**/*.test.ts`, `tsconfig.json`, `next.config.*`, `eslint.config.*`

## Task 1: Add validation workflow

- [ ] Create a feature branch:

```bash
git checkout master
git pull --ff-only
git checkout -b chore/ofertassuper-ci-mvp
```

- [ ] Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  validate:
    name: Lint, typecheck, test, and build
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run ESLint
        run: npm run lint

      - name: Run TypeScript type check
        run: npm run typecheck

      - name: Run tests
        run: npm run test

      - name: Build application
        run: npm run build
```

- [ ] Verify locally before commit:

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
```

Expected: all commands exit with code 0.

If `npm run build` requires production-only environment variables, do not add fake secrets. Prefer one of these honest fixes:

1. Make the build safe for CI by using documented non-secret defaults.
2. Remove `build` from the MVP workflow and document why in the pull request.

- [ ] Commit:

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add validation workflow"
```

- [ ] Push and verify GitHub Actions:

```bash
git push -u origin chore/ofertassuper-ci-mvp
```

Expected: GitHub Actions starts on push or pull request.

## Pull request checklist

- [ ] CI workflow appears under the Actions tab.
- [ ] Workflow runs install, lint, typecheck, tests, and build.
- [ ] Any failure is fixed honestly instead of bypassed.
- [ ] PR description says this is validation CI, not deployment automation.

## CV-safe claim after merge and green workflow

English:

> Added GitHub Actions CI for linting, type checking, automated tests, and build validation in a Next.js/TypeScript project.

Spanish:

> Configuré GitHub Actions CI para linting, type checking, tests automatizados y validación de build en un proyecto Next.js/TypeScript.

## What not to claim

- Do not claim continuous deployment for `ofertaSUPER`.
- Do not claim production-grade CI/CD.
- Do not claim full scraper or ingestion pipeline validation.
- Do not claim green checks unless the workflow passed on GitHub for the current commit.
