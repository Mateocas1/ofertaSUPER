-- Telemetría para diagnóstico de latencia en ingesta
-- Ejecutar estas queries DURANTE un run activo del pipeline para capturar datos en vivo
-- Ref: ./security-audit-fase3.md - FASE 1: Instrumentación

-- ============================================================================
-- 1. Top queries por tiempo total (requiere pg_stat_statements)
-- ============================================================================
-- Este query muestra las queries más extensas ejecutadas en la sesión actual.
-- Si no funciona, verifica que pg_stat_statements esté habilitado:
--   CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SELECT
  query,
  calls,
  total_exec_time,
  mean_exec_time,
  max_exec_time,
  rows
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;

-- ============================================================================
-- 2. Locks activos / no concedidos (ejecutar MIENTRAS corre el ingest)
-- ============================================================================
-- Muestra si hay transacciones bloqueadas esperando locks.
-- Si ves muchos "NOT granted", indica lock contention.
SELECT
  l.pid,
  l.mode as lock_mode,
  l.relation::regclass as table_name,
  l.granted,
  l.waitstart,
  now() - l.waitstart as wait_duration,
  a.query as blocking_query
FROM pg_locks l
LEFT JOIN pg_stat_activity a ON a.pid = l.pid
WHERE NOT l.granted
ORDER BY l.waitstart;

-- ============================================================================
-- 3. Backend activity (ejecutar DURANTE el ingest)
-- ============================================================================
-- Muestra qué queries están corriendo ahora mismo, cuánto tiempo llevan,
-- y si están esperando algo (wait_event).
-- "wait_event_type" puede ser: lock, bufferpin, io, timeout, etc.
SELECT
  pid,
  usename,
  state,
  wait_event_type,
  wait_event,
  query,
  now() - query_start AS duration_sec,
  rows_examined,
  rows_returned
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY query_start;

-- ============================================================================
-- 4. Tamaño de tablas e índices + dead tuple bloat
-- ============================================================================
-- Medir el bloat (dead tuples no limpiados) en las tablas clave.
-- Si n_dead_tup es alto, indica que VACUUM es necesario.
SELECT
  schemaname,
  relname,
  n_live_tup,
  n_dead_tup,
  round(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_ratio,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  pg_size_pretty(pg_relation_size(relid)) AS table_size,
  pg_size_pretty(pg_indexes_size(relid)) AS indexes_size
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(relid) DESC;

-- ============================================================================
-- 5. Index usage ratio (detectar seq scans vs index scans)
-- ============================================================================
-- Índices con idx_scan = 0 son inútiles.
-- Si idx_tup_fetch es muy alto vs idx_scan, el índice está siendo martilleado.
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- ============================================================================
-- 6. Staging table actual state
-- ============================================================================
-- Cuántos productos hay en staging y en qué estado.
-- Si PENDING >> PROMOTED, el cuello está en reconciliación.
SELECT
  count(*) AS total_staging,
  count(*) FILTER (WHERE status = 'PENDING') AS pending,
  count(*) FILTER (WHERE status = 'PROMOTED') AS promoted,
  count(*) FILTER (WHERE status = 'REJECTED') AS rejected,
  count(*) FILTER (WHERE created_at < now() - interval '48 hours') AS stale_48h,
  count(DISTINCT run_id) AS runs
FROM staging_product;

-- ============================================================================
-- 7. Ingestion run history (últimas 20 ejecuciones)
-- ============================================================================
-- Ver duration_ms histórico para detectar degradación.
SELECT
  id,
  batch_id,
  source_slug,
  started_at,
  finished_at,
  duration_ms,
  status,
  products_fetched,
  products_staged,
  products_promoted,
  products_rejected,
  error_summary
FROM ingestion_run
ORDER BY started_at DESC
LIMIT 20;

-- ============================================================================
-- 8. Products table stats
-- ============================================================================
-- Tamaño y contenido de la tabla de productos principal.
SELECT
  count(*) as total_products,
  count(DISTINCT category) as unique_categories,
  count(DISTINCT brand) as unique_brands,
  count(*) FILTER (WHERE image_url IS NOT NULL) as with_images
FROM products;

-- ============================================================================
-- 9. Supermarket products coverage
-- ============================================================================
-- Cuántos productos hay por supermercado.
SELECT
  sm.name,
  count(*) as product_count,
  round(count(*) * 100.0 / (SELECT count(*) FROM supermarket_products), 2) as pct_of_total
FROM supermarket_products sp
JOIN supermarkets sm ON sm.id = sp.supermarket_id
GROUP BY sm.id, sm.name
ORDER BY product_count DESC;

-- ============================================================================
-- 10. Price history table size and growth
-- ============================================================================
-- Alert: si crece sin límite, configura archiving/retention.
SELECT
  count(*) as total_history_records,
  count(DISTINCT supermarket_product_id) as unique_products,
  min(scraped_at) as oldest_record,
  max(scraped_at) as newest_record,
  pg_size_pretty(pg_total_relation_size('price_history'::regclass)) as total_size
FROM price_history;

-- ============================================================================
-- Interpretation Guide for FASE 1 Diagnosis
-- ============================================================================
--
-- Expected finding patterns:
--
-- 1. IF query #3 (backend activity) shows many "lock" wait_events:
--    → H1 (RTT amplification) + H2 (IOPS throttling) are likely
--    → Proceed to FASE 2.1 (collapse reconcile queries)
--
-- 2. IF query #4 (bloat) shows dead_ratio > 10% for staging_product/supermarket_products:
--    → Indicates many UPDATEs without VACUUM
--    → Include FASE 4.4 (VACUUM automation)
--
-- 3. IF query #5 shows indexes with idx_scan = 0:
--    → Dead index, safe to drop in optimization pass
--
-- 4. IF query #6 shows PENDING >> PROMOTED:
--    → Reconciliación es el cuello (H1 confirmed)
--    → Prioritize FASE 2.1
--
-- 5. IF query #7 shows duration_ms trending upward:
--    → Consistent degradation, likely Free tier throttling (H2)
--
-- 6. IF query #10 shows price_history > 500MB:
--    → Archive/retention policy needed (out of scope, but note for later)
