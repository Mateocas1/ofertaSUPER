# ofertasSUPER — Planificación del Proyecto

> Comparador de precios y ofertas de supermercados argentinos VTEX.
> Referencia: [cuantoaumento.com.ar](https://cuantoaumento.com.ar) (open source)

---

## Stack (INMUTABLE — decidido en Plan Mode)

| Componente | Tecnología |
|---|---|
| Frontend + API | Next.js 15 App Router (TypeScript) |
| Styling | Tailwind v4 + shadcn/ui |
| ORM | Prisma |
| Base de datos | Supabase Postgres |
| Cache / Rate-limit | Upstash Redis |
| Auth (solo admin) | Clerk |
| Validación | Zod |
| Charts | Recharts |
| Scraper runtime | Node.js scripts (TypeScript) |
| Scheduling | GitHub Actions cron (cada 6h) |
| Hosting | Vercel |

---

## Supermercados target

| Super | URL | Rol |
|---|---|---|
| Disco | disco.com.ar | **MASTER** (crea productos por EAN) |
| Jumbo | jumbo.com.ar | Follower |
| Vea | vea.com.ar | Follower |
| Carrefour | carrefour.com.ar | Follower |
| DIA Online | diaonline.com.ar | Follower |
| MAS Online | masonline.com.ar | Follower |

---

## VTEX API — Referencia técnica confirmada

```
Endpoint:     {baseUrl}/_v/segment/graphql/v1
operationName: productSuggestions
Hash SHA256:  3eca26a431d4646a8bbce2644b78d3ca734bf8b4ba46afe4269621b64b0fb67d
```

**Variables Base64 (estructura confirmada):**
```json
{
  "productOriginVtex": true,
  "simulationBehavior": "default",
  "hideUnavailableItems": true,
  "advertisementOptions": {
    "showSponsored": true,
    "sponsoredCount": 2,
    "repeatSponsoredProducts": false,
    "advertisementPlacement": "autocomplete"
  },
  "fullText": "<query>",
  "count": 50,
  "shippingOptions": [],
  "variant": null
}
```

**Query params fijos:**
```
workspace=master
maxAge=medium
appsEtag=remove
domain=store
locale=es-AR
operationName=productSuggestions
variables=%7B%7D
extensions=<URL-encoded JSON con persistedQuery + variables>
```

> `VTEX_SHA256_HASH` va en env var server-side, NUNCA como `NEXT_PUBLIC_*`.

---

## Modelo de datos

```
supermarkets         → id, name, slug, logo_url, base_url, is_vtex
products             → ean (PK), name, brand, description, image_url, images[], category
supermarket_products → product_ean (FK), supermarket_id (FK), price, list_price,
                       reference_price, reference_unit, is_available, sku_id,
                       seller_id, product_url, last_checked_at
                       UNIQUE(product_ean, supermarket_id)
price_history        → supermarket_product_id (FK), price, list_price, scraped_at
                       [append-only, retención 90 días]
promotions           → supermarket_id, type (2x1|2nd_50|wallet_discount|bank_discount|percentage),
                       title, wallet_provider?, bank_name?, discount_value, conditions,
                       start_date, end_date, is_active
promotion_products   → promotion_id (FK), product_ean (FK) [promos por producto específico]
categories           → id, name, slug, parent_id?, icon?
```

---

## Variables de entorno requeridas

```env
DATABASE_URL=                           # Supabase Postgres connection string
DIRECT_URL=                             # Supabase direct URL para Prisma migrations
VTEX_SHA256_HASH=3eca26a431d4646a8bbce2644b78d3ca734bf8b4ba46afe4269621b64b0fb67d
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

---

## Estructura de archivos objetivo

```
ofertasSUPER/
├── prisma/
│   ├── schema.prisma               ← Modelo de datos completo
│   └── seed.ts                     ← Seed de los 6 supermercados
├── scripts/
│   ├── scrapers/
│   │   ├── disco.ts                ← Scraper MASTER
│   │   ├── carrefour.ts
│   │   ├── jumbo.ts
│   │   ├── vea.ts
│   │   ├── dia.ts
│   │   └── mas.ts
│   ├── populateDb.ts               ← Población inicial completa
│   ├── updatePrices.ts             ← Actualización precios (cron)
│   └── cleanup-history.ts          ← Limpieza price_history >90 días
├── src/
│   ├── app/
│   │   ├── page.tsx                ← Home
│   │   ├── producto/[ean]/
│   │   │   └── page.tsx            ← Detalle con tabla comparativa
│   │   ├── categoria/[slug]/
│   │   │   └── page.tsx            ← Grid por categoría
│   │   ├── buscar/
│   │   │   └── page.tsx            ← Resultados búsqueda
│   │   ├── ofertas/
│   │   │   └── page.tsx            ← Hub de ofertas/promos
│   │   ├── canasta/
│   │   │   └── page.tsx            ← Comparador de canasta
│   │   ├── admin/
│   │   │   ├── page.tsx            ← Dashboard admin
│   │   │   └── promociones/        ← CRUD promos (Clerk-protected)
│   │   ├── api/
│   │   │   ├── products/
│   │   │   ├── search/
│   │   │   ├── categories/
│   │   │   ├── promotions/
│   │   │   └── admin/promotions/   ← Auth required
│   │   ├── sitemap.ts
│   │   └── robots.ts
│   ├── components/
│   │   ├── product-card.tsx
│   │   ├── price-comparison.tsx
│   │   ├── price-chart.tsx
│   │   ├── search-bar.tsx
│   │   ├── supermarket-badge.tsx
│   │   ├── promotion-badge.tsx
│   │   ├── category-nav.tsx
│   │   └── favorite-button.tsx
│   ├── lib/
│   │   ├── vtex/
│   │   │   ├── client.ts           ← fetchVtexProducts()
│   │   │   ├── normalize.ts        ← normalizeProduct()
│   │   │   ├── encode.ts           ← encodeQuery(), getExtensionsWithQuery()
│   │   │   └── categories.ts       ← DETAILED_CATEGORIES (~200 items)
│   │   ├── db.ts                   ← Prisma client singleton
│   │   ├── redis.ts                ← Upstash Redis client
│   │   ├── rate-limit.ts           ← Sliding window rate limiter
│   │   ├── schemas/
│   │   │   ├── product.ts
│   │   │   ├── search.ts
│   │   │   └── promotion.ts
│   │   ├── promotions/
│   │   │   ├── detect.ts           ← list_price > price → badge
│   │   │   └── alerts.ts           ← Detectar baja de precio
│   │   └── seo/
│   │       ├── metadata.ts
│   │       └── schema.ts           ← JSON-LD: Product, SpecialOffer, BreadcrumbList
│   ├── hooks/
│   │   ├── use-favorites.ts        ← localStorage: ean[]
│   │   └── use-canasta.ts          ← localStorage: { ean, qty }[]
│   └── middleware.ts               ← Clerk: proteger /admin/*
└── .github/workflows/
    ├── populate-db.yml             ← workflow_dispatch manual
    ├── update-prices.yml           ← cron: '0 0,6,12,18 * * *'
    └── cleanup.yml                 ← cron mensual: '0 3 1 * *'
```

---

## FASE 1 — Fundación (Proyecto + DB + Scraper core)

**Objetivo**: Tener datos reales en Supabase con precios de los 6 supermercados.

### Prerequisitos manuales
- [ ] Crear proyecto en Supabase → copiar `DATABASE_URL` y `DIRECT_URL`
- [ ] Confirmar hash VTEX → `3eca26a431d4646a8bbce2644b78d3ca734bf8b4ba46afe4269621b64b0fb67d` ✅
- [ ] Crear proyecto en Upstash Redis → copiar URLs y tokens
- [ ] Crear proyecto en Clerk → copiar keys

### Tareas

- [ ] **1.1** — Inicializar proyecto Next.js 15 con TypeScript + Tailwind + ESLint + App Router + src/
- [ ] **1.2** — Instalar dependencias: prisma, @prisma/client, zod, recharts, @upstash/redis, @upstash/ratelimit, @clerk/nextjs, axios, p-limit, tsx
- [ ] **1.3** — Instalar y configurar shadcn/ui
- [ ] **1.4** — Crear `prisma/schema.prisma` con modelo completo (7 tablas + índices)
- [ ] **1.5** — Primera migración Prisma: `npx prisma migrate dev --name init`
- [ ] **1.6** — Crear `prisma/seed.ts` con los 6 supermercados (nombre, slug, logo, baseUrl)
- [ ] **1.7** — Crear `src/lib/vtex/encode.ts` — builder de URL VTEX con hash
- [ ] **1.8** — Crear `src/lib/vtex/normalize.ts` — normalizar respuesta VTEX al schema propio
- [ ] **1.9** — Crear `src/lib/vtex/categories.ts` — lista de ~200 categorías en español
- [ ] **1.10** — Crear `src/lib/vtex/client.ts` — `fetchVtexProducts()` con retry/backoff
- [ ] **1.11** — Crear `scripts/scrapers/disco.ts` — scraper MASTER
- [ ] **1.12** — Crear scrapers followers: carrefour, jumbo, vea, dia, mas
- [ ] **1.13** — Crear `scripts/populateDb.ts` — ejecuta todos los scrapers secuencialmente
- [ ] **1.14** — Crear `scripts/updatePrices.ts` — re-scrapea EANs ya existentes en DB
- [ ] **1.15** — Crear `.github/workflows/populate-db.yml` (manual dispatch)
- [ ] **1.16** — Crear `.github/workflows/update-prices.yml` (cron cada 6h)
- [ ] **1.17** — Crear `.env.local` con todas las variables requeridas

### Gate de salida Fase 1
- [ ] `npx tsx scripts/scrapers/disco.ts --dry-run` retorna productos normalizados sin error
- [ ] Supabase tiene ≥1000 productos con EAN
- [ ] Al menos 2 supermercados tienen precio para el mismo EAN

---

## FASE 2 — Frontend público + API Routes

**Objetivo**: Sitio funcional con búsqueda, comparación de precios y gráfico de historial.

### Tareas

- [ ] **2.1** — Crear `src/lib/db.ts` — Prisma client singleton
- [ ] **2.2** — Crear `src/lib/redis.ts` + `rate-limit.ts` — Upstash con sliding window (60 req/min/IP)
- [ ] **2.3** — Crear schemas Zod: `product.ts`, `search.ts`, `promotion.ts`
- [ ] **2.4** — `GET /api/products` — listado con filtros (categoría, búsqueda, super, sort)
- [ ] **2.5** — `GET /api/products/[ean]` — detalle con precios de todos los supers + cache Redis
- [ ] **2.6** — `GET /api/products/[ean]/history` — historial para Recharts (30/60/90 días)
- [ ] **2.7** — `GET /api/search?q=` — autocomplete rápido (max 8, cache Redis TTL 5min)
- [ ] **2.8** — `GET /api/categories` — árbol de categorías
- [ ] **2.9** — `GET /api/promotions` — promos activas hoy
- [ ] **2.10** — Componente `SupermarketBadge` — logo + nombre
- [ ] **2.11** — Componente `PromotionBadge` — tipos con colores (2x1=verde, billetera=azul, banco=naranja)
- [ ] **2.12** — Componente `ProductCard` — imagen, nombre, precio min↔max, badges, links
- [ ] **2.13** — Componente `PriceComparison` — tabla: super | precio | precio anterior | Δ% | link
- [ ] **2.14** — Componente `PriceChart` — Recharts LineChart lazy-loaded
- [ ] **2.15** — Componente `SearchBar` — combobox con debounce 300ms + flyout resultados
- [ ] **2.16** — Componente `CategoryNav` — navegación por categorías con iconos
- [ ] **2.17** — Página Home (`/`) — hero con buscador, categorías, top deals, ofertas del día
- [ ] **2.18** — Página Producto (`/producto/[ean]`) — tabla + chart + promos + ISR 6h
- [ ] **2.19** — Página Categoría (`/categoria/[slug]`) — grid + filtros (super, precio, solo ofertas)
- [ ] **2.20** — Página Búsqueda (`/buscar?q=`) — resultados con mini-comparativa inline
- [ ] **2.21** — Página Ofertas (`/ofertas`) — filtros por super/billetera/tipo
- [ ] **2.22** — `generateMetadata` dinámico en todas las páginas

### Gate de salida Fase 2
- [ ] Home → Buscar "Coca Cola" → ver precios en ≥2 supermercados → sin errores
- [ ] Tabla comparativa muestra precios de ≥2 supers con % de diferencia
- [ ] Recharts chart muestra historial con ≥7 días
- [ ] `/api/search?q=coca` retorna resultados en <200ms (con Redis activo)

---

## FASE 3 — Sistema de ofertas + SEO + Seguridad

**Objetivo**: Promos visibles, SEO técnico completo, seguridad hardened.

### Tareas

- [ ] **3.1** — Crear `src/lib/promotions/detect.ts` — detectar descuento si `list_price > price`
- [ ] **3.2** — Crear `src/lib/promotions/alerts.ts` — detectar baja de precio vs historial
- [ ] **3.3** — Crear `src/middleware.ts` — Clerk: proteger `/admin/*` y `/api/admin/*`
- [ ] **3.4** — Panel Admin Dashboard (`/admin`) — stats scraper últimas 24h
- [ ] **3.5** — Panel Admin Promos (`/admin/promociones`) — tabla + filtros activas/vencidas
- [ ] **3.6** — Formulario nueva promo (`/admin/promociones/nueva`) — Zod form con todos los campos
- [ ] **3.7** — `POST /api/admin/promotions` — crear promo (Clerk auth required)
- [ ] **3.8** — `PUT/DELETE /api/admin/promotions/[id]` — editar/eliminar (Clerk auth required)
- [ ] **3.9** — Integrar promos en página de producto — badges + precio final calculado
- [ ] **3.10** — Crear `src/lib/seo/schema.ts` — JSON-LD: Product, SpecialOffer, BreadcrumbList
- [ ] **3.11** — Crear `src/app/sitemap.ts` — todos los productos + categorías
- [ ] **3.12** — Crear `src/app/robots.ts`
- [ ] **3.13** — Rate limiting en todas las rutas `/api/*` (Upstash sliding window)
- [ ] **3.14** — Sanitizar datos VTEX antes de persistir (strip HTML en name/description)
- [ ] **3.15** — Auditoría OWASP: XSS en datos VTEX, IDOR en admin API, header injection

### Gate de salida Fase 3
- [ ] Crear promo "MercadoPago 30% Disco" → aparece en `/ofertas` y en página de Disco
- [ ] Google Rich Results Test pasa con Product schema válido
- [ ] 61 requests a `/api/search` → request 61 retorna 429
- [ ] `grep` en bundle cliente: hash VTEX NO debe aparecer

---

## FASE 4 — Polish + Features avanzados

**Objetivo**: UX premium, PWA, observabilidad y features de fidelización.

### Tareas

- [ ] **4.1** — Hook `use-favorites.ts` + componente `FavoriteButton` (localStorage)
- [ ] **4.2** — Hook `use-canasta.ts` — lista de compras con cantidades (localStorage)
- [ ] **4.3** — Página Canasta (`/canasta`) — total por super en tiempo real
- [ ] **4.4** — Observabilidad scraper: alerta si falla 2+ veces seguido (webhook/email)
- [ ] **4.5** — PWA: `public/manifest.json` + icons + `next-pwa`
- [ ] **4.6** — Script `cleanup-history.ts` — borrar `price_history` > 90 días
- [ ] **4.7** — `.github/workflows/cleanup.yml` — cron mensual
- [ ] **4.8** — Responsive audit completo (mobile-first, touch targets ≥44px)
- [ ] **4.9** — Lighthouse CI en Vercel

### Gate de salida Fase 4
- [ ] Lighthouse ≥90 en Performance, SEO, Accessibility en mobile
- [ ] Scraper falla simulado → alerta en <5 min
- [ ] Canasta con 5 productos muestra total correcto por los 6 supers
- [ ] ISR: cambio de precio en DB se refleja en página dentro de 6h

---

## Quality Gates globales

| Gate | Fase |
|---|---|
| Scraper dry-run sin errores | Fase 1 |
| DB con ≥1000 productos + precios de ≥2 supers | Fase 1 |
| Tabla comparativa funcional con % diferencia | Fase 2 |
| Historial chart con ≥7 días | Fase 2 |
| Search autocomplete <200ms con Redis | Fase 2 |
| Admin promo flow E2E (crear → ver → eliminar) | Fase 3 |
| JSON-LD válido en Google Rich Results Test | Fase 3 |
| Rate limiting 429 en request 61 | Fase 3 |
| Hash VTEX ausente del bundle cliente | Fase 3 |
| Lighthouse ≥90 mobile | Fase 4 |
| ISR revalidation ≤6h | Fase 4 |
| Scraper monitoring funcional | Fase 4 |

---

## Decisiones clave (NO re-litigar)

- Disco = supermercado maestro; el resto solo agrega precios si el EAN ya existe
- Un solo hash VTEX para los 6 supermercados: `3eca26a431d4646a8bbce2644b78d3ca734bf8b4ba46afe4269621b64b0fb67d`
- Promos de billeteras = carga manual en panel admin (no hay API confiable)
- Descuentos automáticos: `list_price > price` en la API VTEX → badge instantáneo
- Sin Coto en v1 (no usa VTEX)
- Sin cuentas de usuario en v1 (público anónimo + un admin con Clerk)
- Favoritos y canasta = localStorage (sin DB, sin auth)
- Scrapers corren en GitHub Actions, NO en el servidor Next.js
