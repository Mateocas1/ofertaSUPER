  # Plan: Ingesta Multi-Fuente Producción

Rediseñar el pipeline de ingesta para eliminar Disco como maestro único usando **peer sources + staging + reconciliación**. Cada fuente VTEX descubre y puntúa productos independientemente; un reconciliador promueve datos validados a producción. Zero regresión con feature flag y shadow mode.

---

## Análisis del Estado Actual

**Problemas críticos identificados en el código:**

1. **Disco como SPOF**: `src/lib/supermarkets.ts` define `role: "master"` solo para Disco → si cae o cambia hash, cero productos nuevos entran al catálogo
2. **Escritura directa sin staging**: `scripts/scrapers/shared.ts` — `persistPricing()` escribe directo a producción sin validación previa
3. **N+1 upserts**: `persistPricing()` hace 2N queries secuenciales (1 upsert + 1 insert history por producto) — O(N) round trips
4. **PriceHistory bloat**: inserta registro aunque el precio no haya cambiado → ~80% registros duplicados
5. **Sin health monitoring**: si el hash VTEX rota, los scrapers fallan silenciosamente — solo el webhook Discord de 2 fallos consecutivos detecta
6. **Cobertura limitada**: `scripts/updatePrices.ts` solo refreshea 500 productos (oldest-first), la cola stale crece

**Qué funciona bien (mantener):** VTEX client con retry/backoff, EAN como PK canónico, normalización robusta (HTML strip, multi-path EAN extraction), query term derivation (n-grams, catalog-driven), rate limiting API

---

## Modelo de Datos — Cambios

**3 tablas nuevas + 2 campos en `supermarkets`**:

### `ingestion_run` — un registro por fuente por ejecución

- `id` Int PK auto
- `batch_id` String — UUID que agrupa fuentes de una ejecución
- `source_slug` String — qué supermercado
- `started_at` DateTime
- `finished_at` DateTime?
- `status` Enum(RUNNING, SUCCESS, PARTIAL, FAILED)
- `queries_sent` Int
- `products_fetched` Int
- `products_staged` Int
- `products_promoted` Int
- `products_rejected` Int
- `error_summary` String?
- `vtex_hash` String — hash used (para tracking de rotaciones)
- `duration_ms` Int?
- Indexes: `[batch_id]`, `[source_slug, started_at]`

### `staging_product` — buffer pre-promoción, retención 48h

- `id` Int PK auto
- `run_id` Int FK → ingestion_run
- `source_slug` String
- `ean` String
- `name` String
- `brand` String?
- `description` String?
- `image_url` String?
- `images` String[]
- `category` String?
- `sku_id` String?
- `seller_id` String?
- `product_url` String?
- `price` Decimal?
- `list_price` Decimal?
- `reference_price` Decimal?
- `reference_unit` String?
- `is_available` Boolean
- `quality_score` Float (0.0–1.0, computed)
- `quality_flags` Json (array of flag strings)
- `status` Enum(PENDING, PROMOTED, REJECTED, DUPLICATE)
- `created_at` DateTime
- Indexes: `[run_id]`, `[ean, source_slug]`, `[status]`, `[created_at]`

### `source_health` — health probe por fuente

- `id` Int PK auto
- `source_slug` String
- `checked_at` DateTime
- `is_healthy` Boolean
- `response_time_ms` Int
- `error_type` String? ('hash_invalid' | 'timeout' | 'blocked' | 'network')
- `hash_valid` Boolean
- `products_returned` Int
- Index: `[source_slug, checked_at]`

### `supermarkets` — agregar campos

- `is_active` Boolean @default(true) — deshabilitar fuente sin borrar
- `freshness_sla_hours` Int @default(12) — ventana SLA configurable

**Sin cambiar**: `products`, `supermarket_products`, `price_history` mantienen su estructura.

---

## Arquitectura del Pipeline

```
HEALTH PROBE ──▶ SCRAPE→staging ──▶ VALIDATE ──▶ RECONCILE ──▶ METRICS
 (per source)      (parallel        (quality      (staging →    (SLA +
                    p-limit(2))      gates)        production)   alertas)
```

### 1. Health Probe

Query liviana ("leche") a cada fuente. Si hash_invalid en TODAS → alerta Discord inmediata. Fuentes no-healthy se saltan pero se registra en `source_health`.

### 2. Scrape → Staging

Cada fuente healthy genera queries (catalog-driven + `DEFAULT_SEARCH_TERMS`). Productos normalizados se insertan en `staging_product` con status=PENDING.

### 3. Quality Gates

| Gate | Severity | Regla |
|------|----------|-------|
| `valid_ean` | BLOCK | `/^\d{8,14}$/` |
| `has_name` | BLOCK | `name.length > 0` |
| `price_positive` | BLOCK | `price === null \|\| price > 0` |
| `price_sane` | BLOCK | `price < 1.500.000 ARS` |
| `price_no_spike` | BLOCK | `price <= historical_avg × 5` |
| `has_brand` | WARN | reduce quality_score |
| `has_image` | WARN | reduce quality_score |
| `has_category` | WARN | reduce quality_score |

- `quality_score = passed_warn / total_warn` (0.0–1.0)
- Cualquier BLOCK fallido → status=REJECTED

### 4. Reconciliación (la pieza central)

- **EAN nuevo**: Crear `product` desde staging record con mayor `quality_score`. Crear `SupermarketProduct` + `PriceHistory` para CADA fuente que lo reportó.
- **EAN existente**: *Protective merge* — rellenar campos null de producción con staging data, NUNCA sobreescribir non-null con null. Actualizar pricing por fuente.
- **PriceHistory optimizado**: insertar SOLO si precio cambió vs último registro (reduce ~80% de inserts)
- **Batch**: `$transaction` por lote de ~100 EANs → de O(2N) round trips a O(N/100) transactions

### 5. Métricas

Freshness = `%productos con last_checked_at < SLA_HOURS`. Target 95%. Alert Discord si < 80%.

---

## Source Adapter Interface

```typescript
interface SourceAdapter {
  slug: string;
  type: 'vtex' | 'custom';
  healthCheck(): Promise<HealthResult>;
  fetchProducts(terms: string[], opts: FetchOptions): Promise<NormalizedProduct[]>;
  getDefaultTerms(): Promise<string[]>;
}
```

Los 6 supers actuales usan `VtexSourceAdapter` (reutiliza `fetchVtexProducts` + `normalizeProduct` existentes). Interfaz extensible para Coto/otros sin YAGNI — solo la interface ahora, implementaciones custom cuando se necesiten.

---

## Anti-bot & Resiliencia

1. **Request jitter**: 800ms–2500ms random delay entre queries VTEX (configurable per-source)
2. **Concurrencia**: p-limit(2) — máximo 2 fuentes scrapeando en paralelo
3. **Response validation**: detectar HTML/CAPTCHA en lugar de JSON → marcar source como blocked
4. **Backoff por fuente**: si errores consecutivos, delay crece exponencialmente (cap 30s)
5. **Hash probe**: antes de full scrape, 1 query de prueba. Si falla → skip fuente, alerta
6. **User-Agent rotation**: pool de 5 UAs reales, rotar por request

---

## Sprints

### Sprint 1: Staging Foundation + Quality Gates

**Meta**: Tablas nuevas + pipeline shadow que escribe SOLO a staging, sin tocar producción.

1. **1.1** Migración Prisma: agregar `ingestion_run`, `staging_product`, `source_health` + enums RunStatus/StagingStatus
2. **1.2** Migración: agregar `is_active`, `freshness_sla_hours` a `supermarkets`
3. **1.3** Crear `SourceAdapter` interface + `VtexSourceAdapter` en `src/lib/ingestion/adapters/`
4. **1.4** Agregar `probeVtexHash()` a `src/lib/vtex/client.ts`
5. **1.5** Crear `scripts/pipeline/health-check.ts` *(depends on 1.1, 1.4)*
6. **1.6** Crear `scripts/pipeline/stage.ts` — fetch vía adapter → insert staging *(depends on 1.1, 1.3)*
7. **1.7** Crear `scripts/pipeline/validate.ts` — quality gates *(depends on 1.1)*
8. **1.8** Crear `scripts/ingest.ts` — orquestador: health → stage → validate, SIN reconcile *(depends on 1.5, 1.6, 1.7)*
9. **1.9** Crear `scripts/cleanup-staging.ts` — delete staging > 48h
10. **1.10** `.github/workflows/ingest.yml` — shadow run (update-prices.yml sigue activo)

**Gate Sprint 1**:
- Shadow run produce ≥ misma cantidad de staging records que productos el pipeline anterior
- Zero staging records con EAN inválido (quality gates block)
- `source_health` registra ≥1 probe por fuente
- Build + typecheck + lint pasan sin error
- Pipeline viejo SIGUE funcionando sin cambios

### Sprint 2: Multi-Source Peer + Reconciliación

**Meta**: Reconciliación promueve staging → producción. Eliminar master/follower.

1. **2.1** Crear `scripts/pipeline/reconcile.ts` — merge EAN + promote staging → producción *(depends on Sprint 1)*
2. **2.2** PriceHistory: solo insertar si precio cambió vs último registro
3. **2.3** Batch upserts: `$transaction` + `createMany` *(parallel with 2.2)*
4. **2.4** Integrar reconcile en `scripts/ingest.ts` (health → stage → validate → reconcile)
5. **2.5** Eliminar rol master/follower en `supermarkets.ts` — todas las fuentes son peers
6. **2.6** Feature flag `INGESTION_V2=shadow|active|off` (env var) *(parallel with 2.1–2.4)*
7. **2.7** Validación 48h en shadow mode: comparar cobertura nuevo vs viejo

**Gate Sprint 2**:
- Cobertura ≥ pipeline viejo
- EANs descubiertos por ≥2 fuentes (no solo Disco)
- Reducción ≥50% inserts PriceHistory
- `INGESTION_V2=shadow` funciona sin errores durante 48h
- Build + typecheck + lint pasan

### Sprint 3: SLA + Observabilidad

**Meta**: Monitoreo completo, dashboard admin, alertas proactivas.

1. **3.1** Crear `src/lib/ingestion/sla.ts` — queries freshness por fuente
2. **3.2** Crear `src/app/admin/ingestion/page.tsx` — dashboard con:
   - Estado de última ejecución por fuente (success/fail, duración, productos)
   - Health grid: estado de cada fuente (healthy/blocked/hash_invalid)
   - Freshness gauge: % productos frescos por fuente vs SLA target
   - Quality distribution: histograma de quality_score
   - Trend: cobertura total (productos) últimos 30 días
3. **3.3** Crear `scripts/pipeline/metrics.ts` — compute + alert *(parallel with 3.2)*
4. **3.4** Discord webhooks expandidos:
   - SLA violation (freshness < 80%)
   - Hash invalidation alert
   - Source blocked alert
   - Quality degradation (>10% rejections en un run)
5. **3.5** API route `GET /api/admin/ingestion` — datos para dashboard (Clerk protected)

**Gate Sprint 3**:
- Dashboard muestra datos reales de ≥3 ejecuciones
- Freshness ≥95% para al menos 3 fuentes
- Hash probe simulated failure → alerta Discord en <5min
- Build + typecheck + lint pasan

### Sprint 4: Resiliencia + Cutover Producción

**Meta**: Hardening anti-bot, cutover definitivo, limpieza código legacy.

1. **4.1** Request jitter configurable (800ms–2500ms) entre queries VTEX
2. **4.2** User-Agent rotation pool (5 UAs)
3. **4.3** Response validation: detectar CAPTCHA/HTML → marcar source blocked *(parallel with 4.1, 4.2)*
4. **4.4** Exponential backoff por fuente en errores consecutivos *(parallel with 4.1, 4.2)*
5. **4.5** `INGESTION_V2=active` — cutover a pipeline nuevo como único *(depends on 4.1–4.4)*
6. **4.6** Eliminar `scripts/populateDb.ts`, `scripts/updatePrices.ts`, lógica master/follower residual *(depends on 4.5)*
7. **4.7** Actualizar workflows: reemplazar `update-prices.yml` → `ingest.yml` *(depends on 4.5)*
8. **4.8** Agregar cleanup-staging al cron mensual *(parallel with 4.6)*
9. **4.9** Documentar pipeline en README.md

**Gate Sprint 4**:
- 2+ semanas runs limpios
- Zero regresiones cobertura
- Fallo simulado (desactivar 1 super) no afecta resto del pipeline
- Build + typecheck + lint pasan
- Código legacy eliminado, no dead code

---

## Archivos

### Crear

- `src/lib/ingestion/adapters/types.ts` — SourceAdapter interface
- `src/lib/ingestion/adapters/vtex-adapter.ts` — wraps fetchVtexProducts + normalizeProduct
- `src/lib/ingestion/adapters/registry.ts` — Map<slug, SourceAdapter>
- `src/lib/ingestion/quality-gates.ts` — rules array
- `src/lib/ingestion/sla.ts` — freshness queries
- `scripts/pipeline/health-check.ts`
- `scripts/pipeline/stage.ts`
- `scripts/pipeline/validate.ts`
- `scripts/pipeline/reconcile.ts`
- `scripts/pipeline/metrics.ts`
- `scripts/ingest.ts` — orquestador principal
- `scripts/cleanup-staging.ts`
- `src/app/admin/ingestion/page.tsx` — dashboard
- `.github/workflows/ingest.yml`

### Modificar

- `prisma/schema.prisma` — 3 tablas nuevas, 2 campos en supermarkets, 2 enums
- `src/lib/supermarkets.ts` — eliminar role master/follower, agregar adapter config
- `src/lib/vtex/client.ts` — agregar probeVtexHash()
- `scripts/scrapers/shared.ts` — mantener para backward compat Sprint 1-2, eliminar Sprint 4

### Eliminar (Sprint 4)

- `scripts/populateDb.ts`
- `scripts/updatePrices.ts`

---

## BigO y Performance

| Operación | Actual | Nuevo |
|-----------|--------|-------|
| DB writes por run | O(2N) individual queries | O(N/B) batched transactions (B≈100) |
| PriceHistory inserts | O(N) siempre | O(C) donde C = precio cambió (~20% de N) |
| Query term resolution | O(P×T) sequential | O(P×T) pero con p-limit(2) parallel por fuente |
| Health probe | No existe | O(S) donde S = fuentes (6 probes, <2s total) |
| Staging cleanup | No existe | O(1) DELETE WHERE created_at < threshold |
| Reconciliation | No existe | O(S log E) con index, S=staging, E=distinct EANs |
| Memory footprint | O(N) Map<ean, product> | Igual (staging en DB, no en memoria) |

---

## Riesgos

| Riesgo | P | I | Mitigación |
|--------|---|---|-----------|
| VTEX hash rotation | Media | Alto | Health probe + alerta Discord. Hash en env var, update manual rápido |
| Anti-bot blocking | Media | Medio | Jitter + UA rotation + backoff. Source isolation: bloqueo de 1 no afecta otras |
| Matching ambiguo sin EAN | Baja | Medio | Política estricta: sin EAN válido → skip (ya implementada) |
| Spike costos Supabase | Baja | Bajo | Retención 48h staging. ~100K records max |
| ToS / legalidad scraping | Media | Alto | Rate limiting conservador, solo datos públicos de pricing |
| Regresión en migración | Media | Alto | Feature flag shadow/active/off + 48h shadow validation |
| Price spike por error fuente | Media | Medio | Quality gate price_no_spike (5x historical avg) → reject + alert |

---

## Verification

1. `npx prisma migrate dev --name ingestion` sin errores, tablas creadas en Supabase
2. `npx tsx scripts/ingest.ts --dry-run` completa health+stage+validate sin escribir a producción
3. `SELECT COUNT(*) FROM staging_product WHERE status='REJECTED'` = 0 para EAN inválidos (gates block)
4. Shadow mode 48h: `SELECT COUNT(DISTINCT ean) FROM staging_product` ≥ `SELECT COUNT(*) FROM products`
5. Post-reconciliación: `SELECT COUNT(*) FROM products` no decrece (monotonic growth)
6. PriceHistory duplicados reducidos ≥50% vs baseline
7. Dashboard admin muestra datos reales en `/admin/ingestion`
8. Desactivar 1 fuente (`is_active=false`) → pipeline completa sin error para las otras 5
9. `npm run typecheck && npm run lint && npm run build` pasan en cada sprint
10. Simular hash failure → `source_health.hash_valid=false` + Discord alert recibida

---

## Decisions

- **No auto-extract hash VTEX del JS bundle**: Fragilidad > beneficio. Probe + alerta + update manual de env var es KISS.
- **No fuzzy matching sin EAN**: VTEX retorna EAN en 95%+ de productos. False positives del fuzzy > beneficio del 5% extra.
- **Adapter interface ahora, implementaciones custom después**: Solo VtexSourceAdapter. Interface lista para Coto sin YAGNI.
- **Feature flag via env var**: `INGESTION_V2=shadow|active|off`. Simple, sin DB. Rollback instantáneo.
- **Staging en Postgres (no Redis)**: Necesita JOINs + aggregations para reconciliación.
- **Retención staging 48h**: Balance trazabilidad vs costo. ~100K records max = dentro del free tier Supabase.
- **PriceHistory solo en cambio**: Reduce bloat dramáticamente sin perder fidelidad de datos.

---

## Further Considerations

1. **Referencia cuanto-aumento-node**: El patrón VTEX client/normalize ya está basado en ese repo. La diferencia fundamental es que cuanto-aumento trackea precios uni-direccionales, mientras ofertasSUPER compara multi-fuente — de ahí la necesidad de reconciliación que el repo de referencia no necesita. Mantenemos la base sólida del client VTEX.

2. **Escalabilidad futura**: Si se agregan >10 fuentes o >50K productos, considerar: (a) partitioning de staging_product por created_at, (b) read replicas para queries del dashboard, (c) queue-based ingestion con BullMQ. Pero NO implementar ahora (YAGNI).

3. **VTEX hash backup**: Considerar almacenar en Redis el último hash funcional + timestamp. Si el hash principal falla pero hay uno en Redis que funcionó hace <7 días, intentar con ese como fallback antes de alertar.
