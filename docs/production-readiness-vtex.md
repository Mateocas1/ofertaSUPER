# ofertasSUPER — VTEX production readiness

Este documento deja explícito qué está implementado, qué se verificó por código y qué NO debe venderse todavía como producción cerrada.

## Decisión

`ofertasSUPER` queda como proyecto principal para portfolio porque ya integra frontend público, APIs Next.js, Prisma/Supabase, Redis, admin, canasta y pipeline de ingesta VTEX. `ofertasas` se usa como referencia técnica complementaria: tiene un enfoque monorepo API/web y experimentos de descubrimiento de hash, pero el portfolio ya apunta a `ofertasSUPER`.

## Evidencia actual

| Área | Estado verificado por código |
|---|---|
| VTEX API | `src/lib/vtex/encode.ts` arma `/_v/segment/graphql/v1` con `operationName=productSuggestions`, variables Base64 y `persistedQuery.sha256Hash`. |
| SHA256 | `VTEX_SHA256_HASH` se lee server-side en `src/lib/vtex/client.ts`; no se expone como `NEXT_PUBLIC_*`. |
| Health check | `probeVtexHash()` clasifica `hash_invalid`, `blocked`, `timeout`, `network` y registra `source_health` vía `scripts/pipeline/health-check.ts`. |
| Probe sin DB | `scripts/probe-vtex.ts` permite validar hash/respuesta VTEX sin Supabase y enmascara el hash en la salida. |
| Anti-bot prudente | El cliente VTEX aplica timeout, retry/backoff, detección de HTML/CAPTCHA, 403/429, jitter configurable y rotación de User-Agent. |
| Ingesta | `scripts/ingest.ts` corre fuentes VTEX con concurrencia `p-limit(2)`, staging, validación, reconciliación y métricas. |
| Búsqueda/listados | `/api/search`, `/api/products`, `/api/promotions`, `/buscar`, `/ofertas`, `/categoria/[slug]`. |
| Canasta | `use-canasta.ts` persiste items en localStorage y `/canasta` compara cobertura/precio por supermercado con datos de `/api/products/[ean]`. |
| Admin promos | Rutas `/admin/promociones` y APIs admin existen protegidas por middleware/Clerk. |
| Tests iniciales | `tests/vtex.test.ts` cubre armado del request VTEX con SHA256, variables Base64, fallback de datos, cálculo de promociones, schema de búsqueda y normalización básica por EAN/precio. |
| Lint | `eslint.config.mjs` ignora artefactos generados `public/*.js`; `npm run lint` corre limpio sobre código fuente. |
| Demo fallback | La home ya responde `200` aunque Supabase no esté disponible; usa datos demo rotulados internamente para evitar una demo pública vacía. Screenshot: `docs/screenshots/home-demo-fallback-2026-05-14.png`. |
| Probe VTEX vivo | `npm run probe:vtex -- --source=disco --query=leche --count=3` devolvió `isHealthy=true`, `hashValid=true`, `productsReturned=3` con red externa. |
| Probe VTEX ampliado | `npm run probe:vtex -- --source=jumbo,carrefour --query=leche --count=3` devolvió `isHealthy=true`, `hashValid=true`, `productsReturned=3` para ambas fuentes. |
| Probe VTEX todas las fuentes | `npm run probe:vtex -- --source=vea,dia,mas --query=leche --count=3` devolvió `isHealthy=true`, `hashValid=true`, `productsReturned=3` para Vea, DIA y MAS. |
| Shadow multi-fuente | `INGESTION_V2=shadow npm run ingest -- --limit=1` salio con codigo 0: `sourceCount=6`, `fetched=114`, `staged=114`, `promoted=0`, `failedSources=0`; `source_health` quedo persistido para carrefour/dia/disco/jumbo/mas/vea con `is_healthy=true`, `hash_valid=true`, `products_returned=5`. |
| Screenshots reales | `/buscar?q=leche`, `/producto/7790387800197` y `/canasta` respondieron/renderizaron datos reales con Supabase activo. Capturas: `docs/screenshots/search-leche-real-2026-05-15.png`, `docs/screenshots/product-7790387800197-comparison-2026-05-15.png`, `docs/screenshots/cart-real-products-2026-05-15.png`. |
| Ingesta con DB | Tras reanudar Supabase, `INGESTION_V2=shadow npm run ingest -- --dry-run --source=disco --limit=1` y `INGESTION_V2=shadow npm run ingest -- --limit=1` ejecutaron con `failedSources=0`; la corrida sin dry-run persistio `source_health` para las 6 fuentes. |

## Referencia externa usada

El repo `FrancoJuri/cuanto-aumento-node` es una referencia útil porque también es un backend Node/Express con scrapers/API para el dominio de precios. Su estructura pública incluye carpetas de `scrapers`, `routes`, `services`, `middlewares` y un documento específico `COMO_OBTENER_HASH.md`, lo cual confirma que el hash VTEX es una preocupación operativa del dominio, no un detalle menor.

## Variables operativas

```env
VTEX_SHA256_HASH=
VTEX_REQUEST_MIN_DELAY_MS=800
VTEX_REQUEST_MAX_DELAY_MS=2500
VTEX_USER_AGENTS="UA 1|UA 2|UA 3"
SCRAPER_ALERT_WEBHOOK_URL=
INGESTION_V2=shadow
```

Notas:

- `VTEX_SHA256_HASH` es obligatorio para scraping real.
- `VTEX_REQUEST_MIN_DELAY_MS` y `VTEX_REQUEST_MAX_DELAY_MS` controlan el jitter entre requests.
- `VTEX_USER_AGENTS` es opcional; si falta, se usa un pool interno de User-Agents reales.

## Qué NO afirmar todavía

- No decir “listo para producción” si no se corrieron gates reales con envs productivas.
- No decir “scraper blindado contra anti-bot”; decir “maneja señales comunes de bloqueo y baja agresividad”.
- No decir “hash auto-recuperable” en `ofertasSUPER`; hoy el hash es env var + health probe + alerta.
- No decir “promos 100% automáticas”; hay detección por precio/list price y CRUD manual de promos.

## Gates para cerrar antes de deploy real

- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run probe:vtex -- --source=disco --query=leche --count=3` para Disco
- [x] `npm run probe:vtex -- --source=jumbo,carrefour --query=leche --count=3`
- [x] `npm run probe:vtex -- --source=vea,dia,mas --query=leche --count=3`
- [x] `npm run lint`
- [ ] Home responde `200` con Supabase no disponible
- [x] Capturar screenshots frescos de busqueda, producto y canasta en `docs/screenshots/`
- [x] `INGESTION_V2=shadow npm run ingest -- --dry-run --source=disco --limit=1`
- [ ] `INGESTION_V2=active npm run ingest -- --source=disco --limit 3`
- [x] Verificar en DB que `source_health.hash_valid=true` para fuentes VTEX despues de restaurar Supabase.
- [x] Confirmar fallback runtime de Redis cache/rate limit: Upstash DNS falla, APIs publicas quedan fail-open y responden 200.
- [ ] Validar admin Clerk con keys de producción.
- [ ] Resolver build PWA activa o dejar `DISABLE_PWA=true` como decisión explícita de deploy.

Runbook del bloqueo DB: `docs/supabase-connection-runbook.md`.

## Portfolio wording defendible

> Comparador de ofertas y precios de supermercados argentinos con ingesta VTEX, normalización por EAN, historial de precios, cache/rate limiting, panel admin de promociones y canasta local para comparar cobertura y totales por supermercado.

Este claim es defendible porque cada parte tiene código verificable en el repo. No implica experiencia laboral ni producción cerrada.
