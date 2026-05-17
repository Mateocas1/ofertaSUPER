# FASE 1: Instrumentación — Guía de Ejecución

## Objetivo
Capturar telemetría granular para aislar el cuello de botella: ¿es latencia de red (H1), throttling de IOPS (H2), o timeouts de pool (H3)?

---

## Paso 1.1: Ejecutar pipeline con timing granular

El código de `scripts/ingest.ts` y `scripts/pipeline/reconcile.ts` ya ha sido instrumentado.

### Ejecutar un run REAL (con DB persist)

En **modo shadow** (sin reconciliación):
```bash
INGESTION_V2=shadow npm run ingest -- --limit 10
```

En **modo active** (con reconciliación):
```bash
INGESTION_V2=active npm run ingest -- --limit 10
```

### Output esperado
El JSON output ahora incluye:

```json
{
  "batchId": "...",
  "mode": "active",  // o "shadow"
  "timing": {
    "totalPipelineMs": 45000,    // Total end-to-end
    "reconcileMs": 30000
  },
  "totals": {
    "fetched": 7200,
    "staged": 7200,
    "promoted": 6800,
    "rejected": 400
  },
  "sources": [
    {
      "slug": "disco",
      "timing": {
        "healthMs": 500,       // Health check latency
        "stageMs": 8000,       // VTEX fetch + INSERT staging
        "validateMs": 2000,    // Quality gates + validate UPDATEs
        "reconcileMs": 30000,  // (solo en active mode)
        "totalMs": 40500
      },
      "...": "..."
    }
  ],
  "reconciliation": {
    "chunkTimings": [
      {
        "chunkIndex": 0,
        "chunkSize": 100,
        "durationMs": 5000    // Time for this chunk
      },
      // ... more chunks
    ]
  }
}
```

### Captura de datos

**Guarda el output JSON completo** para análisis histórico:

```bash
# Modo shadow (~ 20-30 segundos esperados)
INGESTION_V2=shadow npm run ingest -- --limit 10 > /tmp/run-shadow.json 2>&1

# Modo active (~ 40-60+ segundos, acá podría estar el lag)
INGESTION_V2=active npm run ingest -- --limit 10 > /tmp/run-active.json 2>&1
```

---

## Paso 1.2: Ejecutar queries de telemetría SQL

**Durante un run activo**, abre otra terminal y ejecuta las queries con `psql` local:

```powershell
# Verifica que psql esté instalado
psql --version

# Ejecuta el paquete completo de queries
psql "$env:DATABASE_URL" -f docs/telemetry-queries.sql
```

También puedes ejecutar queries puntuales en vivo:

```powershell
psql "$env:DATABASE_URL" -c "SELECT pid, state, wait_event_type, wait_event, now() - query_start AS duration FROM pg_stat_activity WHERE state != 'idle' ORDER BY query_start;"
```

### Queries prioritarias (ejecutar en este orden):

1. **Query #3: Backend activity** — Ver qué queries está esperando/ejecutando
   ```
   SELECT pid, state, wait_event_type, wait_event, query, now() - query_start AS duration
   FROM pg_stat_activity WHERE state != 'idle' ORDER BY query_start;
   ```
   - Si ves muchas con `wait_event_type = 'lock'` → **H1 confirmado** (RTT amplification)
   - Si ves queries con `duration > 5s` → **H2 confirmado** (throttling)

2. **Query #4: Bloat** — Detectar tablas inflamadas de UPDATEs sin VACUUM
   ```
   SELECT relname, n_dead_tup, pg_size_pretty(pg_total_relation_size(relid))
   FROM pg_stat_user_tables WHERE schemaname = 'public'
   ORDER BY pg_total_relation_size(relid) DESC;
   ```

3. **Query #1: Top queries** — Ver cuáles son los queries más lentos acumulados
   ```
   SELECT query, calls, total_exec_time, mean_exec_time
   FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;
   ```

---

## Paso 1.3: Comparar `--dry-run` vs real

**Dry-run** simula todo EXCEPTO DB writes (INSERT/UPDATE/DELETE).

### Ejecutar dry-run

```bash
# Dry-run: VTEX fetch + staging UPDATEs, but NO DB persist
INGESTION_V2=active npm run ingest -- --dry-run --limit 10 > /tmp/run-dryrun.json 2>&1
```

### Interpretar resultados

| Escenario | Shadow | Active | Dry-run | Implicación |
|-----------|--------|--------|---------|------------|
| ~10-20s | 20-30s | 50-120s | ~10s | ✅ Reconciliación es el cuello (H1/H2) |
| ~10-20s | 20-30s | 20-30s | ~50s | ❌ El cuello está en VTEX fetch, no en DB |
| ~10-20s | 20-30s | 50-120s | ~50s | ⚠️ Mix: VTEX + reconciliación |

**Acción basada en resultados:**

- **Si dry-run ≈ dry-run y active >> active**: El cuello es 100% DB writes → FASE 2.1 (colapsar queries de reconcile)
- **Si dry-run >> active pero dry-run es rápido**: El cuello es VTEX fetching → Revisar VTEX API rate limits (fuera de scope FASE 1)
- **Si dry-run ≈ active**: Ambos están lentos → El issue es previo (health check? query terms generación?)

---

## Paso 1.4: Generar reporte FASE 1

Ejecuta este script para consolidar los datos:

```bash
cat > /tmp/fase1_report.sh << 'EOF'
#!/bin/bash

echo "=== FASE 1: Diagnóstico de Latencia ==="
echo "Timestamp: $(date)"
echo ""

echo "1. SHADOW MODE (sin reconciliación):"
INGESTION_V2=shadow npm run ingest -- --limit 10 2>&1 | jq '{
  mode: .mode,
  totalMs: .timing.totalPipelineMs,
  sources: (.sources | map({slug, timing}))
}'

echo ""
echo "2. ACTIVE MODE (con reconciliación):"
INGESTION_V2=active npm run ingest -- --limit 10 2>&1 | jq '{
  mode: .mode,
  totalMs: .timing.totalPipelineMs,
  reconcileMs: .timing.reconcileMs,
  reconcilation: .reconciliation | {
    promoted,
    chunkCount: (.chunkTimings | length),
    chunkTimings: (.chunkTimings | map({chunkIndex, durationMs}))
  },
  sources: (.sources | map({slug, timing}))
}'

echo ""
echo "3. DRY-RUN MODE (sin DB persist):"
INGESTION_V2=active npm run ingest -- --dry-run --limit 10 2>&1 | jq '{
  mode: .mode,
  dryRun: .dryRun,
  totalMs: .timing.totalPipelineMs,
  sources: (.sources | map({slug, timing}))
}'

echo ""
echo "=== DATOS RECOPILADOS ==="
echo "JSON outputs guardados en /tmp/run-*.json"
echo "Queries de telemetría: docs/telemetry-queries.sql"
echo ""
echo "PRÓXIMO PASO: Analizar timing.reconcileMs y reconciliation.chunkTimings"
echo "  - Si reconcileMs > 30s: Proceder a FASE 2.1"
echo "  - Si stageMs > 10s: Investigar VTEX fetch (fuera de scope)"
echo ""
EOF

chmod +x /tmp/fase1_report.sh
bash /tmp/fase1_report.sh
```

---

## Paso 1.5: Análisis de resultados

### Checklist de diagnóstico

- [ ] **Shadow runtime**: _____ ms (target: 20-30s)
- [ ] **Active runtime**: _____ ms (target: 45-60s, si >120s indica H1/H2)
- [ ] **Dry-run runtime**: _____ ms (compara con Active)
- [ ] **reconciledMs**: _____ ms (si > 30s, H1 confirmado)
- [ ] **Chunk timings**: _____ chunks × _____ ms/chunk avg
- [ ] **pg_stat_activity locks**: _____ queries esperando lock (si >10, H1 confirmado)
- [ ] **Bloat ratio**: _____ % dead tuples (si >20%, agenda VACUUM)

### Hipótesis confirmada

|  | H1: RTT Amplification | H2: IOPS Throttling | H3: Pool Exhaustion |
|---|---|---|---|
| **Señal clave** | reconcileMs > 30s + chunk timings altos | pg_stat_activity locks > 50% + wait_event_type=lock | connection exhaustion logs en Supabase |
| **Evivencia en paso 1.2** | `chunkTimings[].durationMs > 5000` | `SELECT count(*) FROM pg_locks WHERE NOT granted` > 10 | Mensajes en stderr: "connection limit exceeded" |
| **Fix prioritario** | FASE 2.1: colapsar queries | FASE 4.2: UNLOGGED staging | FASE 3.2: pool config |

---

## Archivos generados / modificados

✅ **Instrumentación completada en:**
- `scripts/ingest.ts` — Timing granular por fase (health, stage, validate, reconcile)
- `scripts/pipeline/reconcile.ts` — Timing por chunk + array de duraciones
- `docs/telemetry-queries.sql` — Suite de queries para diagnóstico en vivo

📊 **Logs a guardar para análisis:**
- `/tmp/run-shadow.json`
- `/tmp/run-active.json`
- `/tmp/run-dryrun.json`
- Screenshot de `pg_stat_activity` durante run

---

## Monitoreo en vivo (opcional, pero recomendado)

Mientras corre un run en una terminal, en otra ejecuta:

```bash
# Terminal 1: Ejecuta el pipeline
INGESTION_V2=active npm run ingest -- --limit 20

# Terminal 2: Monitor en vivo (requiere tmux o screen)
watch -n 1 'psql $DATABASE_URL -c "SELECT pid, state, query FROM pg_stat_activity WHERE state != '\''idle'\''" 2>/dev/null'
```

---

## Next Steps después de FASE 1

Una vez tengas los datos, el plan procede así:

1. **Si reconcileMs domina**: FASE 2.1 (colapsar queries)
2. **Si stageMs domina**: FASE 4.2 (UNLOGGED staging)
3. **Si healthMs + stageMs altos con pocos chunks**: VTEX API es el cuello (revisar rate limits, headers)
4. **Si equilibrado pero todo lento**: Free tier throttling confirmado, documentar como escape valve: upgrade a Pro

---

## FAQ

**P: ¿Cuántas veces ejecutar cada modo?**
A: Mínimo 1 vez cada uno; si hay variabilidad (>20% devs entre runs), ejecutar 3 veces y promediar.

**P: ¿Puedo volver a modo shadow después de cambiar a active?**
A: Sí, el schema y datos no cambian. Solo cuida el staging_product bloat en modo active.

**P: ¿Las queries SQL de telemetría ralentizan el pipeline?**
A: No (read-only), pero ejecutalas en una conexión separada, nunca en la misma que el pipeline.
