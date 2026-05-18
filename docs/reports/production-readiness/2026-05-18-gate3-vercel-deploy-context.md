# Gate 3 - Vercel deploy context - 2026-05-18

Status: `STOPPED_PENDING_VERCEL_DECISION`

This gate audited the Vercel deployment context without creating, linking, or deploying a project. No Vercel dashboard/project mutation was performed.

## Current evidence

| Check | Result |
|---|---|
| Git branch | `master` |
| Remote | `git@github.com:Mateocas1/ofertaSUPER.git` |
| Local vs remote | `HEAD == origin/master` at `3cb503ef687fb4af94a1ce5a298fb060681a6ff1` |
| Working tree | Clean before Vercel audit docs were written |
| Vercel auth | CLI authenticated as `mateocas1` |
| Local Vercel link | No `.vercel/project.json` found |
| Existing Vercel projects | `test-kimi`, `test-deepseek`, `chat-utn`, `test-ecommerce`, `landing`, `ofertasas-web` |
| Expected ofertasSUPER project | `vercel project inspect ofertas-super` and `vercel project inspect ofertaSUPER` both reported no project |
| Similar legacy project check | `vercel project inspect ofertasas-web` found a project created on `2026-04-14` with root directory `apps/web`, which does not match this checkout root |

Evidence files:

- `docs/reports/production-readiness/2026-05-18-gate3-vercel-whoami.log`
- `docs/reports/production-readiness/2026-05-18-gate3-vercel-project-ls.log`
- `docs/reports/production-readiness/2026-05-18-gate3-vercel-inspect-ofertas-super.log`
- `docs/reports/production-readiness/2026-05-18-gate3-vercel-inspect-ofertaSUPER.log`
- `docs/reports/production-readiness/2026-05-18-gate3-vercel-inspect-ofertasas-web.log`

## Env contract for a Vercel deployment

Values must be set in Vercel without exposing them in git or logs.

Required for a serious public deployment:

- `DATABASE_URL` - Supabase runtime pooler URL.
- `DIRECT_URL` - Supabase direct/session URL for Prisma/admin operations if the Vercel build or operational commands require it.
- `NEXT_PUBLIC_SITE_URL` - final public URL after deploy.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - required because the root layout wraps the app in `ClerkProvider`.
- `CLERK_SECRET_KEY` - required for protected admin/server Clerk calls.
- `ADMIN_EMAILS` - admin allowlist, if admin is enabled.
- `VTEX_SHA256_HASH` - server-side only; needed for VTEX-backed fetches/ingestion code paths.

Recommended production envs:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `DISABLE_PWA=false`
- Optional ingestion/ops vars from `.env.example` only if running operational scripts.

## Docs-verified Vercel CLI path

Context7/Vercel docs confirm the CLI flow:

- `vercel whoami` / `vercel project ls` for account and project discovery.
- `vercel link` or `vercel project add <name>` to link/create a project.
- `vercel env ls` / `vercel env add` / `vercel env pull` for environment variables.
- `vercel --prod` or `vercel deploy --prod` for production deploy.

## Decision needed

There is no verified Vercel project for `ofertasSUPER` yet. The similarly named `ofertasas-web` exists, but the project context says `ofertasas` is the abandoned older variant, so it must not be reused without explicit confirmation.

The read-only `ofertasas-web` inspection reinforces that caution: its root
directory is `apps/web`, while the current `ofertasSUPER` checkout is a
single-app root project. Reusing it would be a project-identity risk unless the
user explicitly confirms that Vercel project should be repointed.

To continue Gate 3, the user must explicitly approve one concrete action:

- create/link a new Vercel project for `ofertasSUPER`; or
- intentionally reuse `ofertasas-web`; or
- configure/import the repo manually in Vercel and provide the public URL for smoke.

## Claim boundary

This gate does not claim the app is deployed. It only proves the repo is pushed, Vercel CLI is authenticated, and the current blocking issue is the missing/undecided Vercel project plus dashboard envs.
