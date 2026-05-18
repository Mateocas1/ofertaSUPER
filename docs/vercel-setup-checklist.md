# Vercel setup checklist for ofertasSUPER

This checklist is the safe handoff for Gate 3. It exists because no verified
Vercel project is currently linked to this checkout, and the similarly named
`ofertasas-web` project points at `apps/web`, not this root-app repository.

## Quick path

1. Create a new Vercel project named `ofertas-super`.
2. Connect GitHub repo `Mateocas1/ofertaSUPER`.
3. Use production branch `master`.
4. Leave Root Directory empty / repository root.
5. Add environment variables in Vercel without pasting values into chat or docs.
6. Deploy from Vercel or run `vercel deploy --prod` only after envs are present.
7. Run the public smoke listed below against the final URL.

## Project settings

| Setting | Expected value | Why |
|---|---|---|
| Project name | `ofertas-super` | Avoids reusing abandoned `ofertasas` identity. |
| Git repo | `Mateocas1/ofertaSUPER` | Matches the pushed source of truth. |
| Production branch | `master` | Current repo branch and pushed HEAD. |
| Root directory | repository root / blank | This checkout is not a monorepo `apps/web` app. |
| Framework | Next.js | Vercel should detect it from `package.json`. |
| Build command | Vercel default (`npm run build` / `next build`) | Do not override unless a deploy log proves it is needed. |

## Required environment variables

Do not commit values. Do not paste values into chat. Store them in Vercel's
Production environment, and usually Preview too if preview deploys are used.

| Variable | Required for | Notes |
|---|---|---|
| `DATABASE_URL` | runtime Prisma/catalog reads | Supabase runtime pooler URL. |
| `DIRECT_URL` | Prisma/admin operations if invoked by build or ops | Supabase direct/session URL. |
| `NEXT_PUBLIC_SITE_URL` | metadata/canonical URL | Set to the final public Vercel URL after it exists. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | root `ClerkProvider` | Use the intended Clerk instance for this deployment. |
| `CLERK_SECRET_KEY` | protected admin/server Clerk calls | Server-side secret only. |
| `ADMIN_EMAILS` | admin allowlist | Comma-separated allowlist if admin is enabled. |
| `VTEX_SHA256_HASH` | VTEX-backed fetches/ingestion paths | Server-side only; never `NEXT_PUBLIC_*`. |

Recommended:

| Variable | Why |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Cache/rate-limit backend; app should fail open but production should configure it. |
| `UPSTASH_REDIS_REST_TOKEN` | Required with Upstash URL. |
| `DISABLE_PWA=false` | Documents normal intended PWA behavior. |

Operational-only variables from `.env.example` should be added only if running
scheduled/manual ingestion jobs from that environment.

## Safe CLI flow after approval

```powershell
vercel whoami
vercel project ls
vercel project add ofertas-super
vercel link --project ofertas-super
vercel env ls
```

Use `vercel env add <NAME>` or the Vercel dashboard for values. Prefer the
dashboard when handling secrets interactively.

Do not run this without explicit approval:

```powershell
vercel deploy --prod
```

## Public smoke after deploy

Replace `<url>` with the final production URL.

| Route | Expected |
|---|---|
| `<url>/` | 200, no framework/Prisma error text. |
| `<url>/buscar?q=leche` | 200, search page renders. |
| `<url>/api/search?q=yerba&limit=1` | 200 JSON; discover sample EAN if available. |
| `<url>/producto/<ean>` | 200 when EAN is discovered from API. |
| `<url>/canasta` | 200. |

Capture evidence under `docs/reports/production-readiness/` and screenshots
under `docs/screenshots/` before marking Gate 3 GREEN.

## Current blocker

Gate 3 remains `STOPPED_PENDING_VERCEL_DECISION` until the user approves project
creation/linking or provides an already configured public URL for smoke.
