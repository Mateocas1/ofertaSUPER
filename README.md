# ofertasSUPER

Comparador de precios y ofertas para supermercados argentinos. El foco actual es una home de búsqueda clara, una canasta inteligente como firma visual y una base de catálogo preparada para comparar productos por EAN.

> Estado: implementación en curso. No vender como producción cerrada ni deploy-ready. Ver `docs/handoff.md` para el estado exacto, verificación y pendientes.

## Qué está en este corte

- Home visual aprobada contra `docs/design/canasta-inteligente-ui-spec.md`.
- Búsqueda principal en `/buscar` con fallback demo si Supabase/Prisma no está alcanzable.
- API `/api/search` fail-open para sugerencias acotadas.
- Prisma schema, catalog layer, helpers VTEX, promoción/precio y tests de base.
- Controles locales de canasta/favoritos sin backend profundo.
- Política admin fail-closed por allowlist o rol explícito.

## Stack

- Next.js 15 App Router + React 19
- TypeScript + Tailwind CSS v4
- Prisma + Supabase Postgres
- Upstash Redis para cache/rate-limit cuando está disponible
- Clerk para futuras superficies admin
- Node test runner vía `tsx --test`

## Arranque local

```bash
npm ci
npm run dev
```

Abrir `http://localhost:3000`.

Variables mínimas esperadas para trabajar con datos reales:

```env
DATABASE_URL=
DIRECT_URL=
VTEX_SHA256_HASH=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
ADMIN_EMAILS=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Sin Supabase/Redis alcanzables, las superficies públicas deben degradar sin romper la demo principal.

## Verificación local

```bash
npm test
npm run typecheck
npm run lint
```

No se corre `npm run build` en este goal por restricción explícita.

## Documentación útil

- `docs/handoff.md` — estado vivo, commits relevantes, QA y pendientes.
- `docs/design/canasta-inteligente-ui-spec.md` — dirección visual aprobada.
- `docs/production-readiness-vtex.md` — qué está verificado y qué falta antes de hablar de producción.
- `docs/repo-publication-checklist.md` — checklist para publicar el repo sin inflar claims.

## Fuera de alcance de este corte

- Producto profundo, canasta profunda, admin completo e ingesta productiva.
- Deploy real o claim de production-ready.
- Build final con PWA.
