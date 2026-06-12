# Direct-refresh Discovery Prod-final PRD

Este PRD define cómo llevar `direct-refresh discovery` desde el estado actual postwrite-ready hasta una operación productiva, repetible, auditable, escalable y segura. El objetivo de negocio es maximizar la cobertura de productos visibles en cada supermercado soportado y mantener sus precios actualizados sin romper contratos de seguridad, performance, rollback ni freshness.

## Decisión ejecutiva

Discovery prod-final no es “correr un script grande”. Es un sistema operacional.

La dirección correcta es:

1. cerrar la verdad documental del estado actual;
2. probar discovery `count=1` para `source-row-discovery`;
3. probar discovery `count=1` para `product-and-source-discovery`;
4. subir a batches controlados `count<=5`;
5. probar todas las fuentes writer-supported;
6. diseñar y construir control plane específico de discovery;
7. medir cobertura real contra denominadores por fuente;
8. integrar discovery con freshness recovery;
9. recién después evaluar cadence source-scoped, nunca all-source como primer salto.

El target aspiracional del producto es “tener listada en ofertasSUPER toda la cantidad de productos disponible en cada web”. Técnicamente ese target queda aceptado como visión, no como promesa ciega. El gate productivo exige una métrica de cobertura por fuente: si una fuente no permite cobertura total sin anti-bot, costos excesivos, datos ambiguos o riesgo operativo, el porcentaje objetivo debe bajarse sólo con evidencia, tradeoff documentado y aprobación explícita.

## Estado actual verificado

| Área | Estado | Evidencia local |
|---|---:|---|
| Discovery read-only audit | Implementado | `scripts/pipeline/direct-refresh-discovery-audit.ts` |
| Discovery create prewrite/apply | Implementado | `scripts/pipeline/direct-refresh-discovery-create-gate.ts` |
| Discovery postwrite audit | Implementado | `scripts/pipeline/direct-refresh-discovery-postwrite-audit.ts` |
| CLI discovery create | Implementado | `scripts/direct-refresh-discovery-create.ts` soporta `prewrite`, `apply`, `postwrite` |
| DB schema base | Existe | `Product`, `SupermarketProduct`, `PriceHistory`, `StagingProduct`, `SourceHealth`, `DirectRefreshRunLedger` |
| VTEX productSuggestions API | Existe | `src/lib/vtex/encode.ts`, `src/lib/vtex/client.ts` |
| VTEX direct lookup API | Existe | `src/lib/vtex/encode.ts` usa `fq=skuId` o `fq=alternateIds_Ean` |
| Freshness policy pública | Existe | `src/lib/price-freshness.ts`, `src/lib/catalog-freshness-policy.ts` |
| Writer-supported sources | Definidas | Carrefour, Vea, Disco, Jumbo, MAS |
| DIA | Excluido de writer support | `docs/direct-refresh-dia-posture.md` |
| Scheduler/all-source/repeated batches | Bloqueado | `docs/direct-refresh-scheduler-gate.md`, `docs/direct-refresh-production-operations-plan.md` |
| Production discovery apply real | Pendiente | No hay pilot ejecutado aún |

## Definición de prod-final

Discovery está prod-final sólo cuando puede operar así:

> Para cada fuente writer-supported, ofertasSUPER puede descubrir, crear, auditar, refrescar y exponer productos nuevos de forma source-scoped, reversible, observable y con freshness SLO, sin depender de memoria humana ni de atajos de código.

### Criterios duros

- Cada run tiene issue aprobado, scope, fuente, intento, artifacts y owner.
- Cada artifact encadena issue/source/count/attempt/path/hash.
- Cada apply tiene prewrite fresco, confirmación exacta y postwrite `PASS`.
- Cada create tiene rollback por IDs concretos, no deletes amplios por EAN.
- Cada producto descubierto entra al modelo de freshness; discovery no se considera éxito si deja precios sin política de actualización.
- Cada fuente tiene denominador de cobertura y métricas de discovery/freshness.
- Cada hard stop falla cerrado antes de escribir.
- Cada decisión fuera del plan se documenta con razón técnica, tradeoff y evidencia.

### Diferencia crítica: coverage vs freshness

Discovery responde: “¿tenemos el producto listado?”.

Freshness responde: “¿el precio publicado es reciente?”.

No se puede declarar discovery prod-final si coverage sube pero freshness queda rota. El producto descubierto debe crear row inicial y luego entrar a refresh-existing/cadence para mantener precio reciente.

## Non-goals y límites

Este PRD no autoriza:

- scheduler execution;
- all-source operation;
- repeated batches sin issue específico;
- DIA writes;
- deploys;
- secrets changes;
- remote config changes;
- cache purge;
- producción apply sin issue aprobado y gates frescos;
- scraping agresivo o evasivo;
- duplicar lógica relajada en lugar de reusar gates existentes.

## Principios de implementación

| Principio | Aplicación concreta |
|---|---|
| DRY | Reusar normalización VTEX, source health, ledger, kill switch, alerting, freshness y postwrite; no forks “rápidos”. |
| YAGNI | No construir scheduler/all-source antes de pilotos, métricas y control plane. |
| KISS | Source-scoped, count pequeño, artifacts planos, comandos explícitos, gates legibles. |
| Fail closed | Missing/malformed/stale/mismatched evidence bloquea. |
| Clean code | Cada módulo con responsabilidad única: audit, prewrite, apply, postwrite, rollback, metrics, planner. |
| Performance first | Bounded scans, pool control, VTEX budgets, índices y reportes antes de volumen. |
| No complacencia | Si un edge case no está probado, no existe como garantía. |

## Modelo de datos a entender y proteger

| Modelo | Rol en discovery | Riesgo |
|---|---|---|
| `Product` | Producto global por `ean`. | Crear producto malo afecta todas las fuentes. |
| `SupermarketProduct` | Relación producto-fuente, precio actual, SKU, seller, URL y `last_checked_at`. | Duplicado por EAN/source o SKU incorrecto rompe comparación. |
| `PriceHistory` | Historial inicial y sucesivo de precios. | Crecimiento, índices y rollback deben ser controlados. |
| `StagingProduct` | Estado de ingesta previa. | Conflicto con pending staging puede duplicar o pisar workflows. |
| `SourceHealth` | Estado de fuente/hash/respuesta. | Freshness WARN no siempre bloquea, safety FAIL sí. |
| `DirectRefreshRunLedger` | Run key, source lock, status, lineage. | Sin ledger no hay operación repetible ni safe cadence. |

### Invariantes de DB

- `Product.ean` es identidad global.
- `SupermarketProduct` es único por `(product_ean, supermarket_id)`.
- `PriceHistory` siempre referencia `supermarket_product_id`.
- Discovery source-row no crea `Product`.
- Discovery product-and-source crea `Product` sólo si no existe globalmente.
- Rollback product-and-source no borra `Product` si luego tiene otra referencia válida.

## API y scraping VTEX que debemos entender

### API local actual

| Área | Implementación |
|---|---|
| Product suggestions | `/_v/segment/graphql/v1`, `operationName=productSuggestions`, persisted query `sha256Hash`, variables base64. |
| Direct lookup | `/api/catalog_system/pub/products/search?fq=skuId:<id>` o `fq=alternateIds_Ean:<ean>`. |
| Normalización | `src/lib/vtex/normalize.ts` extrae EAN, SKU, seller, prices, availability, category, images, URL. |
| Health | `probeVtexHash` detecta `hash_invalid`, timeout, blocked, network, unknown. |
| Rate posture actual | Delay aleatorio por request y retries acotados. |

### Superficies de API de ofertasSUPER que discovery debe proteger

| Superficie | Qué debe probar discovery prod-final |
|---|---|
| `/api/search` | Los productos descubiertos aparecen como sugerencias sólo cuando la calidad y freshness copy son correctas; cache TTL no debe ocultar estados postwrite críticos. |
| `/api/products` | La lista pública incluye productos descubiertos sin degradar ranking, paginación, filtros ni freshness-aware ordering. |
| `/api/products/[ean]` | El detalle del producto descubierto muestra supermercados, precios, historial y freshness sin claims falsos. |
| `/api/products/[ean]/history` | El `PriceHistory` inicial y posterior se expone sin duplicados ni gaps inexplicables. |
| Admin ingestion routes | Discovery no debe mezclarse con staging/ingestion pending sin gates; cualquier admin action queda separada del control plane de discovery. |
| Redis/cache | Cache debe ser TTL-bound y observable; si se requiere invalidación, se diseña en issue separado, no como purge manual improvisado. |

### Requisitos de investigación antes de prod-final

- Confirmar si `productSuggestions` puede cubrir catálogo completo o sólo una ventana de búsqueda.
- Confirmar estabilidad del `sha256Hash`; hash invalid debe bloquear discovery/cadence.
- Comparar `productSuggestions` vs direct catalog lookup para cobertura, latencia, duplicados y availability.
- Definir términos/categorías por fuente para cobertura medible.
- Detectar anti-bot/rate-limit por fuente y presupuestos seguros.
- Documentar cualquier limitación de VTEX que impida “100% literal”.

### Política de `sha256Hash`

- El hash vigente nunca se asume sano por memoria; se prueba con `probeVtexHash` o gate equivalente.
- `hash_invalid` bloquea discovery y freshness para la fuente afectada.
- Un cambio de hash requiere issue propio, evidencia de probe, tests de request builder y documentación del tradeoff.
- No se persiste ni se imprime secreto; el hash se trata como configuración operacional.
- Direct catalog lookup por SKU/EAN puede servir como fallback de verificación, no como excusa para saltar el contrato de suggestions si el denominator depende de search.

## Dry-run/write boundary

Cada fase debe declarar explícitamente si es read-only, dry-run o write-capable.

| Boundary | Permitido | Prohibido |
|---|---|---|
| Read-only audit | DB reads, VTEX reads acotados, artifact JSON. | Writes, staging mutation, cache purge, scheduler. |
| Dry-run planning | Simular selección, capacity, denominator, freshness debt. | Crear products, source rows, history rows. |
| Prewrite | Releer live/DB, emitir exact confirmation. | Escribir rows. |
| Apply | Escribir sólo el plan prewrite fresco y confirmado. | Ampliar scope, all-source, retry automático. |
| Postwrite | DB reads para probar lo escrito. | Reparar en silencio o borrar rows. |

La palabra “dry” no puede ser decorativa. Si un comando dice dry-run pero muta DB, es bug crítico.

## Cobertura objetivo

La visión del producto es cobertura completa de cada web. El PRD la traduce a gates medibles:

| Nivel | Cobertura | Uso |
|---|---:|---|
| Pilot | 1 producto | Probar contrato mínimo. |
| Batch controlado | 5 productos | Probar selección múltiple y rollback. |
| Fuente inicial | >=25 productos nuevos por fuente o denominador pequeño completo | Probar repetibilidad por fuente. |
| Cobertura operacional | >=80% del denominador medido por fuente | Primer umbral razonable si 100% no es viable. |
| Prod-final target | >=95% del denominador medido por fuente y freshness final >=95%/12h para writer-supported rows | Target final. |
| 100% literal | Sólo si VTEX/API/costos/riesgo lo permiten con evidencia | No se promete sin prueba. |

Si bajar de 100% es necesario, debe existir un decision record con:

- fuente afectada;
- denominador medido;
- causa técnica;
- riesgo de intentar 100%;
- porcentaje aceptado;
- impacto en UX;
- plan futuro para mejorar.

## Fases del roadmap

### Fase 0 — PRD, plan truth y docs cleanup

Objetivo: dejar el mapa correcto antes de ejecutar.

Entregables:

- este PRD aprobado;
- `docs/direct-refresh-production-operations-plan.md` actualizado para mover #183/#185 a completed/history;
- issue sequence clara;
- goal prompt extendido.

Gate de éxito:

- no hay “next steps” cerrados listados como pendientes;
- el plan diferencia discovery coverage de freshness recovery;
- no hay autorización accidental de scheduler/all-source.

### Fase 1 — Discovery pilot source-row `count=1`

Objetivo: probar creación de source row sin crear producto global.

Flujo:

1. issue aprobado;
2. fresh discovery audit `PASS`;
3. create prewrite `PASS`;
4. apply con exact confirmation;
5. postwrite `PASS`;
6. baseline/freshness observacional;
7. issue comment con evidence.

Gate de éxito:

- `productCreatesPlanned = 0`;
- `supermarketProductCreatesPlanned = 1`;
- `priceHistoryCreatesPlanned = 1`;
- rollback plan contiene IDs exactos;
- no extra rows;
- no source/staging/SKU conflict.

### Fase 2 — Discovery pilot product-and-source `count=1`

Objetivo: probar creación global de producto y source row.

Gate de éxito:

- se crea exactamente un `Product`;
- se crea exactamente un `SupermarketProduct`;
- se crea exactamente un `PriceHistory`;
- postwrite compara todos los campos persistidos;
- rollback producto sólo permitido si no hay referencias posteriores;
- product quality review explícito aprueba nombre, brand, image, category, URL y mojibake status.

### Fase 3 — Controlled batch discovery `count<=5`

Objetivo: probar batch pequeño sin perder auditabilidad.

Gate de éxito:

- count máximo 5;
- todos los selected keys son únicos;
- no pending staging conflict;
- no duplicate source SKU;
- postwrite PASS para todos;
- si una row falla, el batch se considera incidente completo, no éxito parcial;
- no retry automático.

### Fase 4 — Cross-source validation

Objetivo: demostrar que discovery funciona por fuente, no sólo en Vea.

Fuentes:

- Carrefour;
- Vea;
- Disco;
- Jumbo;
- MAS.

Gate de éxito:

- al menos un source-row o product-and-source pilot por fuente, según disponibilidad real;
- batch controlado donde haya candidatos suficientes;
- host guard específico por fuente;
- source health y capacity revisados;
- blockers documentados si la fuente no puede progresar.

### Fase 5 — Discovery coverage denominator

Objetivo: saber qué significa “todos los productos” por fuente.

Entregables:

- auditor read-only de denominador por fuente;
- estrategia de términos/categorías;
- dedupe por EAN/SKU;
- reporte de candidates selected/blocked/already-covered;
- cobertura actual vs cobertura objetivo;
- fuente de verdad para denominador.

Gate de éxito:

- cada fuente tiene denominator timestamped;
- el denominador no depende de una sola query arbitraria;
- las limitaciones de VTEX/API quedan documentadas;
- el reporte puede explicar por qué un producto no se crea.

### Fase 6 — Discovery control plane

Objetivo: convertir discovery en operación, no scripts aislados.

Requisitos:

- ledger específico o extensión segura de `DirectRefreshRunLedger`;
- source-scoped locks;
- idempotency persistida;
- TTL de audit/prewrite;
- artifact root estándar;
- transition states: `PLANNED`, `RUNNING`, `STOPPED`, `FAILED`, `COMPLETED`;
- owner y issue metadata;
- stop reason y error summary;
- no overlapping source attempts.

Gate de éxito:

- dos runs simultáneos de la misma fuente no pueden escribir;
- artifact mismatch falla cerrado;
- terminal states no transicionan;
- attempt resume/stop está definido;
- no scheduler requerido para operar manualmente.

### Fase 7 — Freshness integration

Objetivo: que productos descubiertos no queden listados con precios eternamente viejos.

Requisitos:

- discovery-created rows entran a source health/freshness denominator;
- `last_checked_at` y `PriceHistory.scraped_at` se inicializan correctamente;
- freshness baseline corre después de postwrite;
- refresh-existing puede actualizar filas descubiertas;
- UI/API no presenta precio stale como actual.

Gate de éxito:

- producto descubierto aparece en API pública con freshness metadata;
- su precio puede ser actualizado por refresh-existing;
- freshness target de writer-supported rows vuelve al roadmap 90%/24h y 95%/12h;
- no se confunde coverage success con freshness success.

### Fase 8 — Performance y escalabilidad

Objetivo: crecer sin romper VTEX, Prisma ni public APIs.

Requisitos:

- scan-count bounded;
- source-specific request budgets;
- backoff por blocked/429/timeout;
- Prisma pool guard;
- transaction duration limits;
- PriceHistory growth monitoring;
- índice review para `supermarket_products`, `price_history`, `staging_product`;
- public query performance antes/después;
- cache policy para search/product APIs.

Gate de éxito:

- batch `count<=5` no degrada public APIs;
- no pool exhaustion;
- no transaction timeout;
- PriceHistory insert rate modelado;
- si VTEX bloquea/rate-limitea, la fuente queda STOPPED y no se reintenta automático.

### Fase 9 — Alerts, rollback drill y ownership

Objetivo: que fallas sean operables.

Alertas mínimas:

- discovery audit FAIL;
- prewrite stale;
- apply FAIL;
- postwrite FAIL;
- rollback required;
- duplicate SKU spike;
- staging conflict spike;
- VTEX hash invalid;
- VTEX blocked/rate-limited;
- freshness below target;
- ledger active conflict.

Gate de éxito:

- cada alerta tiene severity, owner, next action y retry policy;
- rollback drill ejecutado en read-only/safe mode;
- no-partial verification existe para incidentes;
- issue comments son suficientes para handoff.

### Fase 10 — Cadence discovery source-scoped

Objetivo: operación repetible semi-automática con humanos en el control.

Requisitos:

- disabled by default;
- one source per run;
- no all-source first implementation;
- no automatic retry after failure;
- prewrite/human confirmation sigue siendo obligatorio al inicio;
- later automation sólo después de evidence boring y approved issue.

Gate de éxito:

- cadence puede preparar work units, no saltarse gates;
- cada work unit tiene issue/artifacts/postwrite;
- kill switch se re-chequea antes de apply;
- source health y VTEX hash se re-chequean antes de live fetch.

### Fase 11 — Prod-final acceptance

Discovery alcanza prod-final cuando todos estos checks pasan:

- [ ] PRD aprobado y plan ejecutable creado.
- [ ] Docs-state limpio.
- [ ] Source-row pilot `count=1` PASS.
- [ ] Product-and-source pilot `count=1` PASS.
- [ ] Batch controlled `count<=5` PASS.
- [ ] Cross-source evidence para Carrefour, Vea, Disco, Jumbo y MAS.
- [ ] Denominator por fuente definido y medido.
- [ ] Coverage >=95% del denominator medido por fuente, o excepción aprobada con tradeoff.
- [ ] Freshness >=95%/12h para writer-supported public-rankable rows, o fase de recovery explícitamente separada.
- [ ] Ledger/locks/idempotency/TTL integrados.
- [ ] Alerts/owner/retry/rollback policy activos.
- [ ] Rollback drill/no-partial verification probado.
- [ ] Performance budgets y DB index review aprobados.
- [ ] VTEX hash/API drift policy implementada.
- [ ] Public APIs muestran freshness y no claims falsos.
- [ ] No scheduler/all-source/repeated execution fuera de scope aprobado.

## Edge cases obligatorios

| Edge case | Comportamiento requerido |
|---|---|
| EAN global existe, source row no | `source-row-discovery`; no crear `Product`. |
| EAN global no existe | `product-and-source-discovery` con quality review. |
| Source row ya existe | `already-covered`; no write. |
| Pending staging row existe | Stop. |
| SKU duplicado en misma fuente | Stop. |
| SKU cambia entre audit y apply | Transaction recheck; stop o replan. |
| EAN cambia entre live fetches | Stop; no crear. |
| Product URL host drift | Stop. |
| Mojibake | Stop salvo waiver explícito sólo donde esté permitido por política. |
| Precio null/zero/negativo | Stop. |
| Producto unavailable | Stop para create; puede quedar como diagnosis futura. |
| `sha256Hash` inválido | Stop source; refresh hash policy issue. |
| VTEX devuelve HTML/captcha/403/429 | Stop source; backoff/hardening issue. |
| Prewrite >15 min | Stop; rerun prewrite. |
| Apply artifact no matchea prewrite | Stop. |
| Postwrite encuentra extra rows | Incident. |
| Rollback broad by EAN | Prohibido. |
| Later reference to created product | No borrar product en rollback; documentar orphan/reference decision. |
| Public cache sirve dato viejo | Invalidate/TTL policy; no claim de current price. |

## Race conditions obligatorias

| Race | Mitigación |
|---|---|
| Otro run crea mismo EAN/source entre audit y apply | Recheck dentro de transaction. |
| Otro run crea mismo SKU/source | Source lock + SKU query + unique/idempotency policy. |
| Staging aparece después de audit | Recheck staging antes de write. |
| Kill switch cambia | Recheck antes de apply. |
| Source health/hash cambia | Recheck antes de live fetch/apply. |
| Freshness baseline corre durante write | Baseline sólo después de postwrite PASS o marcado observacional. |
| Human confirmation llega tarde | TTL fail closed. |
| Artifact de otro attempt se pasa al CLI | issue/source/count/keys/timestamps/hash mismatch fail closed. |
| Public API lee mientras se crea producto | Transaction debe dejar estado consistente o no escribir. |
| PriceHistory crece durante audit | Postwrite por IDs concretos, no por max ID amplio. |

## Arquitectura propuesta

| Módulo | Responsabilidad |
|---|---|
| `discovery-audit` | Detectar candidates y clasificación; read-only. |
| `discovery-create-gate` | Prewrite/apply con exact confirmation y transaction rechecks. |
| `discovery-postwrite` | Probar rows creadas, no extra rows y rollback IDs. |
| `discovery-denominator` | Medir universo por fuente, términos/categorías y coverage. |
| `discovery-ledger` | Control plane de attempts, locks, status y lineage. |
| `discovery-freshness-bridge` | Incorporar descubiertos a freshness recovery. |
| `discovery-alerts` | Alertas específicas y policy de incidentes. |
| `discovery-runbook` | Operación humana, rollback, no-partial, ownership. |
| `discovery-cadence-planner` | Preparar work units source-scoped sin escribir automáticamente. |

## Decision records obligatorios

Toda desviación del PRD debe quedar registrada antes o junto con el cambio.

Formato mínimo:

| Campo | Requerido |
|---|---|
| Decisión | Qué cambia respecto al PRD. |
| Razón técnica | Qué evidencia obliga o recomienda cambiar. |
| Tradeoff | Qué ganamos y qué riesgo aceptamos. |
| Alternativa rechazada | Qué opción más simple o estricta se descartó y por qué. |
| Gate afectado | Qué acceptance criteria cambian. |
| Reversibilidad | Cómo se revierte la decisión si sale mal. |

Sin decision record, el cambio no existe como arquitectura; es improvisación.

## Issue sequence recomendado

| Orden | Issue | Tipo | Resultado |
|---:|---|---|---|
| 1 | `docs(data): add direct-refresh discovery prod-final PRD` | docs | Este PRD + docs truth cleanup. |
| 2 | `ops(data): run source-row discovery pilot count1` | ops | Primer create source-row PASS. |
| 3 | `ops(data): run product-and-source discovery pilot count1` | ops | Primer create global product PASS. |
| 4 | `feat(data): add discovery denominator audit` | feature | Medición de cobertura por fuente. |
| 5 | `ops(data): run controlled discovery batch count5` | ops | Batch pequeño PASS. |
| 6 | `ops(data): validate discovery across writer-supported sources` | ops | Carrefour/Vea/Disco/Jumbo/MAS cubiertos. |
| 7 | `feat(data): add discovery run ledger integration` | feature | Attempts, locks, TTL, lineage. |
| 8 | `feat(data): add discovery freshness bridge` | feature | Discovered rows integradas a freshness recovery. |
| 9 | `feat(data): add discovery alerts and rollback drill report` | feature | Alerts + rollback/no-partial. |
| 10 | `perf(data): add discovery performance budgets` | perf | VTEX/Prisma/PriceHistory budgets e index review. |
| 11 | `docs(data): design discovery source-scoped cadence` | docs | Cadence plan sin all-source automático. |
| 12 | `ops(data): certify discovery prod-final gate` | ops | Acceptance final con evidencia. |

Cada issue debe ser review-sized. Si supera 400 líneas, usar chained PRs o pedir `size:exception` explícito.

## Goal prompt extendido

```text
/goal Execute the ofertasSUPER direct-refresh discovery prod-final roadmap from docs/direct-refresh-discovery-prod-final-prd.md with zero shortcuts.

Rules:
- Follow the PRD phase order unless a technical decision record documents why a different order is safer.
- Never run npm run build.
- Use strict TDD for implementation work.
- Keep PRs review-sized; use chained PRs when changed lines exceed the review budget.
- No scheduler execution, all-source operation, repeated batches, DIA writes, deploys, secrets changes, remote config changes, cache purge, or production writes unless the phase has a dedicated approved issue and exact gate evidence.
- Every production write requires approved issue, fresh audit/prewrite, exact confirmation, apply report, postwrite PASS, rollback IDs, baseline/freshness observation, and issue evidence comment.
- If a better approach is found, document the decision, technical reason, tradeoff, and affected files before implementation.
- Fail closed on missing, stale, malformed, mismatched, cross-source, cross-count, cross-attempt, or non-PASS evidence.

Objective:
Bring direct-refresh discovery from postwrite-ready tooling to prod-final operation: source-row pilot, product-and-source pilot, controlled batch <=5, cross-source validation, denominator/coverage measurement, ledger/locks/idempotency/TTL, freshness bridge, alerts/ownership/rollback drill, performance budgets, and final prod acceptance.

Prod-final acceptance:
- writer-supported sources Carrefour, Vea, Disco, Jumbo, and MAS are covered or explicitly excluded with evidence;
- discovery coverage reaches >=95% of measured per-source denominator, or a lower target is approved with documented technical constraints;
- freshness for writer-supported public-rankable rows reaches the 95%/12h target or remains in a separately approved freshness recovery phase;
- every discovery run is source-scoped, auditable, reversible, owned, alertable, and safe to stop.
```

## Stop rules finales

Stop inmediato si:

- se propone “sólo probar en prod” sin artifact chain;
- se mezcla discovery coverage con freshness success;
- se intenta all-source para ahorrar tiempo;
- se ignora VTEX hash/source health;
- se escriben rows sin postwrite plan;
- se borra por EAN sin IDs;
- se saltea edge cases por “improbables”;
- se cambia código sin test o sin justificación.

Esto no es burocracia. Es la diferencia entre operación productiva y esperanza.
