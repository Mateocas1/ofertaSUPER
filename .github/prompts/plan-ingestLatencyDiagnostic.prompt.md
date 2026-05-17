# Plan: Diagnóstico y Fix de Latencia en Ingesta Supabase

## TL;DR
El pipeline de ingesta (ingest.ts) sufre latencia de minutos por una combinación de: (1) amplificación de round-trips de red en la fase de reconciliación (9-11 queries seriales × 70-160 transacciones × latencia RTT GH Actions↔Supabase), (2) anti-patrón N+1 disfrazado dentro de las transacciones Prisma, y (3) throttling de IOPS/CPU del Free tier de Supabase bajo carga de escritura sostenida. El plan ataca las tres capas en orden de mayor impacto.

---

## Contexto confirmado
- **Supabase Free tier** (shared compute, IOPS limitados)
- **DATABASE_URL** → Supavisor pooler (6543), **DIRECT_URL** → directa (5432)
- **Prisma 6.19** como ORM (no raw pg, no COPY)
- **pLimit(2)** para concurrencia de fuentes
- **batchSize = 100** en reconciliación
- **6 supermercados** × ~24 queries × 50 productos = ~7,200 productos/run estimados
- **Reconciliación**: loop secuencial de chunks, cada chunk en `$transaction` con 9-11 round trips
- **Validate**: updates individuales por producto (quality_score + status)

---

## Hipótesis Core (ordenadas por probabilidad)

### H1: Amplificación de RTT en reconciliación (★★★ más probable)
`reconcileChunk()` ejecuta 9-11 queries seriales DENTRO de cada $transaction:
1. `findMany` products by EAN
2. `createMany` new products
3. `Promise.all` de updates individuales (protective merge) — SERIAL en Prisma tx
4. `findMany` supermarket_products
5. `createMany` new supermarket_products
6. `Promise.all` de updates individuales (supermarket_products) — SERIAL
7. `findMany` refreshed supermarket_products (SEGUNDO read)
8. `findMany` latest price_history (con DISTINCT)
9. `createMany` price_history
10. `updateMany` staging_product status → PROMOTED

Con ~7,200 candidatos / batchSize 100 = **72 transacciones secuenciales**.
72 tx × ~10 RT × ~50-100ms RTT = **36-72 segundos solo en network wait**.
En Free tier con throttling: fácilmente 2-5 minutos.

### H2: IOPS/CPU throttling del Free tier bajo write-storm
El Free tier de Supabase tiene shared compute. El pipeline genera un burst de:
- ~7,200 INSERTs en staging (createMany, OK)
- ~7,200 UPDATEs en validate (individuales, malo)
- ~72 transacciones en reconcile con mezcla de reads + writes en 4 tablas

Esto satura el budget de IOPS compartido. Las queries posteriores se encolan detrás del throttle fence.

### H3: Prisma $transaction timeout + connection stall
Prisma `$transaction` por defecto tiene `maxWait: 2000ms` y `timeout: 5000ms`. Si Supavisor está bajo presión, las transacciones fallan silenciosamente o se reintentan, y Prisma abre más connections del pool → exhaust de los ~10 slots disponibles en Free tier.

---

## Telemetría Requerida

### Desde los logs del pipeline (JSON output del ingest.ts)
- [ ] Output JSON completo del último run exitoso (totals.fetched, totals.staged, totals.promoted, duration_ms por source)
- [ ] `INGESTION_V2` env value actual (shadow / active)
- [ ] Ejecutar con `--dry-run` y contrastar duration vs run real (aísla DB write overhead)

### Desde Supabase Dashboard
- [ ] **Database → Reports → Database Health**: CPU usage durante el run, disk IOPS
- [ ] **Database → Reports → Connections**: peak connections durante el run (buscar si llega al límite)
- [ ] **Database → Extensions**: confirmar si `pg_stat_statements` está habilitado

### Queries SQL a ejecutar en Supabase SQL Editor
```sql
-- 1. Top queries por tiempo total (requiere pg_stat_statements)
SELECT query, calls, total_exec_time, mean_exec_time, rows
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;

-- 2. Locks activos durante un run (ejecutar MIENTRAS corre el ingest)
SELECT pid, mode, relation::regclass, granted, waitstart
FROM pg_locks
WHERE NOT granted
ORDER BY waitstart;

-- 3. Backend activity (ejecutar DURANTE el ingest)
SELECT pid, state, wait_event_type, wait_event, query, now() - query_start AS duration
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC;

-- 4. Tamaño de tablas e índices (medir bloat)
SELECT schemaname, relname, n_live_tup, n_dead_tup,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC;

-- 5. Index usage ratio (detectar seq scans)
SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- 6. Staging table size actual
SELECT count(*) AS total_staging,
       count(*) FILTER (WHERE status = 'PENDING') AS pending,
       count(*) FILTER (WHERE status = 'PROMOTED') AS promoted,
       count(*) FILTER (WHERE created_at < now() - interval '48 hours') AS stale
FROM staging_product;
```

---

## Attack Plan por capas

### FASE 1: Instrumentación (prerequisito)

**Paso 1.1** — Agregar timing granular por fase en `ingest.ts`
- Medir `health_ms`, `stage_ms`, `validate_ms`, `reconcile_ms` por source
- Medir `reconcile_chunk_ms[]` (array de duración por chunk)
- Esto confirma o descarta H1 vs H2

**Paso 1.2** — Ejecutar las queries de telemetría SQL listadas arriba
- Ejecutar DURANTE un run activo del pipeline
- Capturar `pg_stat_activity` para ver si hay queries encoladas

**Paso 1.3** — Ejecutar `--dry-run` y comparar duración total vs run real
- Si dry-run tarda ~20s y real tarda ~300s → el delta es 100% DB write overhead
- Si dry-run también tarda minutos → el cuello está en VTEX fetching, no en DB

---

### FASE 2: Capa de Red (reducción de round trips)

**Paso 2.1** — Colapsar reconcileChunk a 2-3 queries raw SQL en lugar de 9-11 Prisma calls
- Reemplazar el loop `Promise.all(mergeUpdates.map(tx.product.update))` por un solo `UPDATE ... FROM (VALUES ...)` batch
- Reemplazar `Promise.all(updateSupermarketProducts.map(tx.supermarketProduct.update))` por un solo UPDATE batch
- Eliminar el segundo `findMany` de refreshed supermarket_products usando `INSERT ... RETURNING id`
- Resultado: de ~10 round trips/chunk a ~3 round trips/chunk → 70% reducción de latencia RTT

**Paso 2.2** — Incrementar batchSize de reconciliación de 100 a 500-1000
- Menos transacciones, menos overhead de BEGIN/COMMIT
- Requiere validar que el timeout de $transaction sea suficiente

**Paso 2.3** — Para el staging: evaluar bypass de Prisma con `COPY FROM STDIN` via `pg` driver directo
- `createMany` de Prisma genera `INSERT INTO ... VALUES (...), (...), ...` que es O(N) en parámetros
- Para 2,700 rows × 20 columnas = 54,000 parámetros bind → overhead significativo
- `COPY` es ordenes de magnitud más rápido para bulk insert
- Depende de si la conexión directa (5432) está accesible desde GH Actions

---

### FASE 3: Capa de Aplicación

**Paso 3.1** — Reemplazar validate updates individuales por updateMany batch
- Actualmente: loop de `stagingProduct.update({ where: { id }, data: { quality_score, ... } })` por cada producto
- Fix: agrupar por (quality_score, status) y hacer `updateMany` con `id IN (...)` para cada grupo
- O usar raw SQL: `UPDATE staging_product SET quality_score = v.score, status = v.status FROM (VALUES ...) v WHERE staging_product.id = v.id`

**Paso 3.2** — Configurar Prisma connection pool explícitamente
- Prisma por defecto: `connection_limit = num_cpus * 2 + 1`
- En GH Actions runner (2 vCPUs): `connection_limit = 5`
- Free tier Supabase: max ~20 connections via pooler
- Setear explícitamente: `DATABASE_URL=...?connection_limit=3&pool_timeout=10`
- Evitar que Prisma abra más connections de las que Supavisor permite

**Paso 3.3** — Evaluar cambiar `$transaction` interactive a `$transaction` con raw SQL batch
- `db.$transaction([...])` con array de promises (sequential) vs `db.$executeRaw` con SQL multi-statement
- Reduce overhead de Prisma deserialization/serialization por round trip

---

### FASE 4: Capa de Base de Datos

**Paso 4.1** — Deshabilitar temporalmente índices no-UNIQUE durante reconciliación
- `staging_product_status_idx`, `staging_product_created_at_idx`, `staging_product_ean_source_slug_idx`
- Cada INSERT en staging paga costo de actualización de 4 índices
- Patrón: DROP INDEX → bulk insert → CREATE INDEX CONCURRENTLY
- Solo viable si se ejecuta en ventana exclusiva (cron nocturno)

**Paso 4.2** — Evaluar UNLOGGED table para staging_product
- `ALTER TABLE staging_product SET UNLOGGED;`
- Elimina WAL writes para staging (tabla temporal por diseño, 48h retention)
- Riesgo: datos se pierden en crash de Supabase → aceptable dado que staging es efímero
- **Impacto esperado**: 2-3x speedup en INSERT/UPDATE a staging

**Paso 4.3** — Optimizar getHistoricalAverages en validate
- La query `AVG(ph.price) ... GROUP BY sp.product_ean` hace full scan de price_history
- Agregar índice parcial: `CREATE INDEX ON price_history(supermarket_product_id) WHERE price IS NOT NULL`
- O materializar promedios en una materialized view

**Paso 4.4** — VACUUM ANALYZE post-reconciliación
- Después de miles de UPDATEs, las dead tuples inflan las tablas
- `VACUUM ANALYZE staging_product, products, supermarket_products, price_history;`
- Programar en cleanup workflow

---

## Orden de ejecución recomendado

```
FASE 1 (instrumentación)     → prerequisito
  ↓ confirma hipótesis
FASE 2.1 (colapsar queries)  → mayor impacto esperado (50-70% reducción)
FASE 2.2 (batch size up)     → paralelo con 2.1
FASE 3.1 (validate batch)    → paralelo con 2.1
  ↓ medir
FASE 4.2 (UNLOGGED staging)  → quick win, bajo riesgo
FASE 3.2 (pool config)       → quick win
FASE 3.3 (tx timeouts)       → quick win
  ↓ si insuficiente

FASE 2.3 (COPY bypass)       → mayor refactor
FASE 4.1 (disable indexes)   → solo si staging INSERT es >30% del total
FASE 4.3 (optimize AVG)      → solo si validate es el cuello
FASE 4.4 (VACUUM)            → mantenimiento
```

---

## Verificación

1. Ejecutar `ingest.ts` con timing por fase antes y después de cada fix
2. Comparar `duration_ms` de `ingestion_run` records históricos vs post-fix
3. Monitorear Supabase Dashboard → CPU/IOPS durante run para confirmar que ya no hay throttling spikes
4. Ejecutar `pg_stat_statements` antes y después: `mean_exec_time` de las top queries debe bajar
5. **Target**: pipeline completo (6 supermarkets, mode=active) en **< 60 segundos**

---

## Decisiones y scope

- **Incluido**: optimización de código, queries, y config de DB sin cambiar plan de Supabase
- **Excluido**: upgrade de plan (el fix debe funcionar en Free tier), cambio de ORM
- **Riesgo principal**: Free tier tiene hard limits de IOPS que ningún fix de código puede superar si el volumen escala significativamente → Pro tier como escape valve documentado, no como primera opción

---

## Consideraciones adicionales

1. **¿Activar mode `active` si actualmente está en `shadow`?** — En shadow, reconcile no corre y la latencia debería ser mucho menor. Si la latencia ya es mala en shadow, el cuello está en staging/validate, no en reconcile. Confirmar el mode antes de atacar reconcile.
2. **¿Mover el runner de GH Actions a la misma región que Supabase?** — Si Supabase está en `us-east-1` y GH Actions usa un runner standard (también US), el RTT es ~5-20ms. Si Supabase está en otra región, el RTT sube a 100ms+ y el impacto de la Fase 2 se amplifica.
