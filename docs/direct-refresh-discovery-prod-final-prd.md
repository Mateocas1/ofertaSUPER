# Direct-refresh Discovery Prod-final PRD

Este PRD define cómo llevar `direct-refresh discovery` desde el estado actual postwrite-ready hasta una operación productiva, repetible, auditable, escalable y segura. El objetivo de negocio es maximizar la cobertura de productos visibles en cada supermercado soportado y mantener sus precios actualizados sin romper contratos de seguridad, performance, rollback ni freshness.

## Decisión ejecutiva

Discovery prod-final no es “correr un script grande”. Es un sistema operacional.

La dirección correcta es:

1. cerrar la verdad documental del estado actual;
2. instalar los gates mínimos antes de cualquier write real: DB constraints, control plane, lineage, rollback/DR, VTEX budgets y compliance;
3. medir cobertura real contra denominadores por fuente con un auditor read-only y presupuestado;
4. probar discovery `count=1` para `source-row-discovery`;
5. probar discovery `count=1` para `product-and-source-discovery`;
6. subir a batches controlados `count<=5`;
7. probar todas las fuentes writer-supported;
8. integrar discovery con freshness recovery hasta SLO final;
9. validar performance/escala con budgets reales;
10. recién después evaluar cadence source-scoped, nunca all-source como primer salto.

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

## Correcciones incorporadas por audit adversarial

La primera versión de este PRD fue rechazada por revisión dual. Esta versión corrige esos blind spots antes de permitir implementation planning:

| Hallazgo confirmado | Corrección en este PRD |
|---|---|
| Prod-final podía pasar con freshness separada. | Prod-final exige freshness `>=95%/12h`; si no, el estado máximo es `coverage-operational`, no prod-final. |
| Writes antes de control plane. | Se agregó una fase pre-write obligatoria antes de cualquier apply real. |
| Invariantes DB asumidas, no verificadas. | Se agregó gate de constraints/schema/index/idempotency antes del primer write. |
| Fases e issue sequence no coincidían. | Se define una única secuencia canónica. |
| VTEX/performance budgets llegaban tarde. | Request budgets, concurrency, timeout, backoff y compliance pasan a ser prerequisitos de denominator/pilots. |
| Performance general podia seguir tarde. | Fase 1 incorpora minimum performance guard antes de cualquier apply; Fase 8 queda solo para validacion de escala posterior. |
| Artifact lineage insuficiente. | Cada artifact debe incluir commit, versión de tool, schema, DB/env identity, source config y VTEX probe. |
| Rollback/DR llegaba tarde. | Rollback drill ejecutado, preimage, PITR/backup posture y post-rollback verification son prerequisitos pre-write. |

## Definición de prod-final

Discovery está prod-final sólo cuando puede operar así:

> Para cada fuente writer-supported, ofertasSUPER puede descubrir, crear, auditar, refrescar y exponer productos nuevos de forma source-scoped, reversible, observable y con freshness SLO, sin depender de memoria humana ni de atajos de código.

### Criterios duros

- Cada run tiene issue aprobado, scope, fuente, intento, artifacts y owner.
- Cada artifact encadena issue/source/count/attempt/path/hash.
- Cada artifact declara `gitCommit`, tool/script version, schema version, DB/environment identity, source config snapshot, VTEX hash y probe timestamp cuando aplica.
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

### Estados permitidos

| Estado | Significado | Puede llamarse prod-final |
|---|---|---:|
| `planning-ready` | PRD, plan y issue sequence aprobados. | No |
| `pilot-ready` | Gates pre-write, denominator y budgets mínimos listos. | No |
| `coverage-operational` | Discovery crea y audita coverage por fuente, pero freshness SLO todavía no llega. | No |
| `freshness-operational` | Coverage y freshness SLO pasan con operación manual/source-scoped. | No |
| `discovery-prod-final` | Coverage target, freshness `>=95%/12h`, control plane, rollback/DR, alerts, ownership, performance y cadence policy pasan. | Sí |

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

### Gate de schema/constraints antes de cualquier write

Antes del primer `apply` real, un issue de foundation debe verificar o implementar:

| Constraint/gate | Requisito |
|---|---|
| `Product.ean` | Primary key confirmado y cubierto por tests de create conflict. |
| `SupermarketProduct(product_ean, supermarket_id)` | Unique confirmado y probado contra doble insert concurrente. |
| `SupermarketProduct(supermarket_id, sku_id)` | Debe existir constraint/index único cuando `sku_id` no es null, o decisión documentada con alternativa equivalente de bloqueo transaccional. |
| Discovery idempotency key | Persistido por attempt/source/key antes de escalar más allá de pilot; si no existe, no hay batch ni cross-source. |
| `PriceHistory(supermarket_product_id, scraped_at)` | Índice suficiente para postwrite/freshness/history reads. |
| `StagingProduct(ean, source_slug, status)` | Índice suficiente para recheck de conflicts antes de write. |
| Migration status | `prisma migrate status` o evidencia equivalente debe estar disponible para el environment usado. |

Si un constraint no puede agregarse por compatibilidad, la decisión debe explicar el tradeoff y la mitigación transaccional. “Lo re-chequea el código” no alcanza como justificación para prod-final.

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
- Revisar allowed-use/TOS/robots o postura operacional equivalente por fuente antes de denominator a escala.
- Documentar cualquier limitación de VTEX que impida “100% literal”.

### Política de `sha256Hash`

- El hash vigente nunca se asume sano por memoria; se prueba con `probeVtexHash` o gate equivalente.
- `hash_invalid` bloquea discovery y freshness para la fuente afectada.
- Un cambio de hash requiere issue propio, evidencia de probe, tests de request builder y documentación del tradeoff.
- No se persiste ni se imprime secreto; el hash se trata como configuración operacional.
- Direct catalog lookup por SKU/EAN puede servir como fallback de verificación, no como excusa para saltar el contrato de suggestions si el denominator depende de search.

### Budgets VTEX mínimos antes de denominator o pilot

Cada fuente debe tener un presupuesto explícito antes de cualquier live scan que no sea trivial:

| Budget | Gate |
|---|---|
| Request cap | Máximo de requests por attempt y por fuente. |
| Concurrency | Default serial o concurrencia baja justificada por evidencia. |
| Timeout | Timeout por request y timeout total del attempt. |
| Backoff | Backoff por timeout/429/403/HTML/captcha. |
| Stop rule | Fuente `STOPPED` ante blocked/rate-limit/hash_invalid; no retry automático. |
| User-agent/header policy | Documentada, no evasiva ni agresiva. |
| Compliance | Allowed-use/TOS/robots revisado o riesgo aceptado explícitamente antes de escalar. |

Un auditor read-only también puede dañar la operación si martilla VTEX. “No escribe DB” no significa “sin riesgo”.

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

### Fórmulas de métricas

Estas fórmulas son obligatorias para evitar números lindos pero inútiles:

| Métrica | Fórmula |
|---|---|
| Denominador por fuente | Productos únicos por EAN detectables por VTEX/API para una fuente dentro del snapshot de denominator, excluyendo sólo items con exclusión documentada. |
| Coverage por fuente | `covered_source_rows / denominator_source_rows * 100`. `covered_source_rows` cuenta rows en `supermarket_products` con EAN presente en denominator y source matching. |
| Discovery gap | `denominator_source_rows - covered_source_rows`, agrupado por blocker: already-covered, missing-source-row, missing-product-and-source, blocked-quality, blocked-VTEX, blocked-compliance. |
| Freshness por fuente | `fresh_public_rankable_rows / public_rankable_rows * 100`, usando SLA por fuente y `last_checked_at`/`PriceHistory.scraped_at` según la política vigente. |
| Prod-final freshness | Writer-supported aggregate y per-source deben cumplir `>=95%` dentro de `12h`; no basta aggregate si una fuente queda degradada sin excepción. |
| Coverage exception | Porcentaje menor a 95 sólo con decision record aprobado y causa técnica reproducible. |

Exclusiones permitidas:

- productos unavailable persistentes, si la fuente los expone pero no son comprables;
- productos sin EAN válido;
- productos bloqueados por compliance;
- productos con datos corruptos que no pasan quality gate;
- DIA u otra fuente formalmente audit-only/no-writer.

Cada exclusión debe contarse. No puede desaparecer del denominador silenciosamente.

## Fases del roadmap

Esta es la unica secuencia canonica. Si el implementation plan o un issue proponen otro orden, deben incluir decision record antes de ejecutar.

### Fase 0 - PRD, plan truth y docs cleanup

Objetivo: dejar el mapa correcto antes de ejecutar.

Entregables:

- este PRD aprobado por judgment;
- `docs/direct-refresh-production-operations-plan.md` actualizado para mover #183/#185 a completed/history;
- issue sequence clara;
- goal prompt extendido.

Gate de exito:

- no hay "next steps" cerrados listados como pendientes;
- el plan diferencia discovery coverage de freshness recovery;
- no hay autorizacion accidental de scheduler/all-source;
- el PRD no contiene contradicciones entre fases e issue sequence.

### Fase 1 - Pre-write foundation obligatoria

Objetivo: que ningun pilot real escriba antes de tener los minimos de seguridad operacional.

Entregables:

- schema/constraints/index gate aprobado;
- control plane minimo: source lock, ledger/attempt identity, TTL, owner, stop/resume states e idempotency policy;
- artifact lineage extendida: issue/source/count/attempt/path/hash, `gitCommit`, tool/script version, schema version, DB/environment identity, source config snapshot, VTEX hash/probe timestamp;
- rollback/DR proof: preimage capture, rollback mode, PITR/backup posture, rollback drill ejecutado antes de cualquier apply real, post-rollback verification y cache handling;
- rollback drill proof antes de cualquier apply real: drill ejecutado en non-prod/prod-like environment o controlled disposable-row mode, con evidencia de rollback por IDs exactos y post-rollback verification;
- read-only rollback review puede ser evidencia preparatoria, pero no satisface rollback drill proof;
- VTEX request budgets por fuente;
- minimum performance guard: Prisma pool posture, transaction timeout posture, PriceHistory insert/read baseline, public API baseline y cache TTL baseline;
- compliance/allowed-use gate por fuente;
- minimo alert channel para write/postwrite/rollback-required.

Gate de exito:

- no puede ejecutarse `apply` si falta ledger/lock/TTL/owner;
- no puede ejecutarse `apply` si artifact lineage no incluye commit/schema/env/source config;
- no puede ejecutarse `apply` si no existe rollback plan, rollback drill ejecutado y post-rollback verification;
- no puede ejecutarse `apply` si falta minimum performance guard;
- no puede ejecutarse live scan si faltan request caps/backoff/stop rules;
- no puede ejecutarse scaled denominator si falta compliance posture.

### Fase 2 - Discovery coverage denominator read-only

Objetivo: saber que significa "todos los productos" por fuente antes de prometer coverage.

Entregables:

- auditor read-only de denominador por fuente;
- estrategia de terminos/categorias;
- dedupe por EAN/SKU;
- reporte de candidates selected/blocked/already-covered;
- cobertura actual vs cobertura objetivo;
- fuente de verdad para denominador;
- formulas de coverage/freshness aplicadas;
- VTEX request budget aplicado en cada run.

Gate de exito:

- cada fuente tiene denominator timestamped;
- el denominador no depende de una sola query arbitraria;
- las limitaciones de VTEX/API quedan documentadas;
- el reporte puede explicar por que un producto no se crea;
- el run no excede request budget ni dispara blocked/rate-limit/hash_invalid.

### Fase 3 - Discovery pilot source-row `count=1`

Objetivo: probar creacion de source row sin crear producto global.

Flujo:

1. issue aprobado;
2. pre-write foundation PASS;
3. fresh discovery audit `PASS`;
4. create prewrite `PASS`;
5. apply con exact confirmation;
6. postwrite `PASS`;
7. rollback/no-partial verification disponible;
8. baseline/freshness observacional;
9. issue comment con evidence.

Gate de exito:

- `productCreatesPlanned = 0`;
- `supermarketProductCreatesPlanned = 1`;
- `priceHistoryCreatesPlanned = 1`;
- rollback plan contiene IDs exactos;
- no extra rows;
- no source/staging/SKU conflict;
- post-rollback verification esta definido aunque no se ejecute rollback real.

### Fase 4 - Discovery pilot product-and-source `count=1`

Objetivo: probar creacion global de producto y source row.

Gate de exito:

- se crea exactamente un `Product`;
- se crea exactamente un `SupermarketProduct`;
- se crea exactamente un `PriceHistory`;
- postwrite compara todos los campos persistidos;
- rollback producto solo permitido si no hay referencias posteriores;
- product quality review explicito aprueba EAN/GTIN check digit, nombre, brand, image, category, URL, pack/unit, currency/list-price semantics, multi-seller selection, availability y mojibake status.

### Fase 5 - Controlled batch discovery `count<=5`

Objetivo: probar batch pequeno sin perder auditabilidad.

Gate de exito:

- count maximo 5;
- todos los selected keys son unicos;
- idempotency esta persistida o formalmente probada por ledger/control plane;
- no pending staging conflict;
- no duplicate source SKU;
- postwrite PASS para todos;
- si una row falla, el batch se considera incidente completo, no exito parcial;
- no retry automatico.

### Fase 6 - Cross-source validation

Objetivo: demostrar que discovery funciona por fuente, no solo en Vea.

Fuentes:

- Carrefour;
- Vea;
- Disco;
- Jumbo;
- MAS.

Gate de exito:

- al menos un source-row o product-and-source pilot por fuente, segun disponibilidad real;
- batch controlado donde haya candidatos suficientes;
- host guard especifico por fuente;
- source health y capacity revisados;
- blockers documentados si la fuente no puede progresar;
- compliance posture revisada por fuente antes de escalar.

### Fase 7 - Freshness integration y recovery hasta SLO

Objetivo: que productos descubiertos no queden listados con precios eternamente viejos.

Requisitos:

- discovery-created rows entran a source health/freshness denominator;
- `last_checked_at` y `PriceHistory.scraped_at` se inicializan correctamente;
- freshness baseline corre despues de postwrite;
- refresh-existing puede actualizar filas descubiertas;
- UI/API no presenta precio stale como actual;
- freshness recovery alcanza `>=95%/12h` para writer-supported public-rankable rows antes de prod-final.

Gate de exito:

- producto descubierto aparece en API publica con freshness metadata;
- su precio puede ser actualizado por refresh-existing;
- freshness per-source y aggregate cumplen `>=95%/12h`;
- si freshness no cumple, el estado maximo es `coverage-operational`, no `discovery-prod-final`;
- no se confunde coverage success con freshness success.

### Fase 8 - Performance y escalabilidad

Objetivo: validar escala despues de pilotos sin romper VTEX, Prisma ni public APIs. Esta fase no reemplaza el minimum performance guard de Fase 1; si ese guard falta, no arrancan Fase 3+ ni applies reales.

Requisitos:

- scan-count bounded;
- source-specific request budgets;
- backoff por blocked/429/timeout;
- Prisma pool guard;
- transaction duration limits;
- PriceHistory growth monitoring;
- indice review para `supermarket_products`, `price_history`, `staging_product`;
- public query performance antes/despues;
- cache policy para search/product APIs;
- load-sensitive dry-run donde sea seguro.

Gate de exito:

- batch `count<=5` no degrada public APIs;
- no pool exhaustion;
- no transaction timeout;
- PriceHistory insert rate modelado contra baseline de Fase 1;
- public search/product APIs no degradan respecto al baseline de Fase 1;
- si VTEX bloquea/rate-limitea, la fuente queda STOPPED y no se reintenta automatico.

### Fase 9 - Alerts, rollback drill y ownership final

Objetivo: que fallas sean operables y visibles. El primer rollback drill ya debe estar probado en Fase 1 antes de cualquier write real; esta fase revalida/certifica alerts, ownership y drill final con evidencia actualizada.

Alertas minimas:

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

Gate de exito:

- cada alerta tiene severity, channel, owner, ack SLA, resolution SLA, escalation path, suppression/noise policy y retry policy;
- test-alert proof existe;
- rollback drill de Fase 1 tiene evidencia de ejecucion vigente; si cambio schema/env/tooling o expiro la evidencia, se re-ejecuta en non-prod/prod-like environment o controlled disposable-row mode;
- no-partial verification existe para incidentes;
- issue comments son suficientes para handoff.

### Fase 10 - Cadence discovery source-scoped

Objetivo: operacion repetible semi-automatica con humanos en el control.

Requisitos:

- disabled by default;
- one source per run;
- no all-source first implementation;
- no automatic retry after failure;
- prewrite/human confirmation sigue siendo obligatorio al inicio;
- later automation solo despues de evidence boring y approved issue.

Gate de exito:

- cadence puede preparar work units, no saltarse gates;
- cada work unit tiene issue/artifacts/postwrite;
- kill switch se re-chequea antes de apply;
- source health y VTEX hash se re-chequean antes de live fetch.

### Fase 11 - Prod-final acceptance

Discovery alcanza prod-final cuando todos estos checks pasan:

- [ ] PRD aprobado y plan ejecutable creado.
- [ ] Docs-state limpio.
- [ ] Pre-write foundation PASS: DB constraints, control plane, lineage, rollback/DR, VTEX budgets, compliance.
- [ ] Rollback drill ejecutado y minimum performance guard completados antes del primer apply real.
- [ ] Denominator por fuente definido, medido y budgeted.
- [ ] Source-row pilot `count=1` PASS.
- [ ] Product-and-source pilot `count=1` PASS.
- [ ] Batch controlled `count<=5` PASS.
- [ ] Cross-source evidence para Carrefour, Vea, Disco, Jumbo y MAS.
- [ ] Coverage >=95% del denominator medido por fuente, o excepcion aprobada con tradeoff.
- [ ] Freshness >=95%/12h para writer-supported public-rankable rows; sin excepcion para llamar prod-final.
- [ ] Ledger/locks/idempotency/TTL integrados.
- [ ] Alerts/owner/retry/rollback policy activos.
- [ ] Rollback drill/no-partial/post-rollback verification probado.
- [ ] Performance budgets y DB index review aprobados.
- [ ] VTEX hash/API drift policy implementada.
- [ ] Public APIs muestran freshness y no claims falsos.
- [ ] No scheduler/all-source/repeated execution fuera de scope aprobado.

Si todos los checks de coverage pasan pero freshness no llega a `>=95%/12h`, el resultado se llama `coverage-operational`. No se llama `discovery-prod-final`.

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
| EAN/GTIN check digit inválido | Stop; no crear product global. |
| Pack/unit ambiguo | Stop o manual review; no normalizar inventando. |
| Currency/list-price inconsistente | Stop; no publicar descuento/precio derivado. |
| Multi-seller con ofertas divergentes | Selección canónica documentada o stop. |
| Precio null/zero/negativo | Stop. |
| Producto unavailable | Stop para create; puede quedar como diagnosis futura. |
| `sha256Hash` inválido | Stop source; refresh hash policy issue. |
| VTEX devuelve HTML/captcha/403/429 | Stop source; backoff/hardening issue. |
| Compliance/TOS/robots no revisado | Stop antes de denominator a escala o cadence. |
| Rollback drill ejecutado ausente | Stop antes de cualquier write real. |
| Minimum performance guard ausente | Stop antes de cualquier write real. |
| Prewrite >15 min | Stop; rerun prewrite. |
| Apply artifact no matchea prewrite | Stop. |
| Postwrite encuentra extra rows | Incident. |
| Rollback broad by EAN | Prohibido. |
| Later reference to created product | No borrar product en rollback; documentar orphan/reference decision. |
| Public cache sirve dato viejo | Invalidate/TTL policy; no claim de current price. |
| PITR/backup posture desconocido | Stop antes de write real. |

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
| Artifact generado con otro commit/schema/env | `gitCommit`, tool version, schema version y DB/environment identity mismatch fail closed. |
| Source config cambia entre audit y apply | Source config snapshot mismatch fail closed. |
| Public API lee mientras se crea producto | Transaction debe dejar estado consistente o no escribir. |
| PriceHistory crece durante audit | Postwrite por IDs concretos, no por max ID amplio. |

## Arquitectura propuesta

| Módulo | Responsabilidad |
|---|---|
| `discovery-audit` | Detectar candidates y clasificación; read-only. |
| `discovery-prewrite-foundation` | Verificar schema constraints, budgets, compliance, DR, lineage y mínimos de control plane antes de writes. |
| `discovery-create-gate` | Prewrite/apply con exact confirmation y transaction rechecks. |
| `discovery-postwrite` | Probar rows creadas, no extra rows y rollback IDs. |
| `discovery-denominator` | Medir universo por fuente, términos/categorías y coverage. |
| `discovery-ledger` | Control plane de attempts, locks, status y lineage. |
| `discovery-freshness-bridge` | Incorporar descubiertos a freshness recovery. |
| `discovery-alerts` | Alertas específicas y policy de incidentes. |
| `discovery-runbook` | Operación humana, rollback, no-partial, ownership. |
| `discovery-cadence-planner` | Preparar work units source-scoped sin escribir automáticamente. |
| `discovery-quality-gate` | Validar GTIN/EAN, pack/unit, currency, availability, list-price semantics, multi-seller y mojibake. |

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
| 2 | `feat(data): add discovery prewrite safety foundation` | feature | DB constraints, minimum control plane, lineage, rollback drill ejecutado, minimum performance guard, VTEX budgets y compliance gates. |
| 3 | `feat(data): add discovery denominator audit` | feature | Medición de cobertura por fuente con formulas y request budgets. |
| 4 | `ops(data): run source-row discovery pilot count1` | ops | Primer create source-row PASS con foundation previa. |
| 5 | `ops(data): run product-and-source discovery pilot count1` | ops | Primer create global product PASS. |
| 6 | `ops(data): run controlled discovery batch count5` | ops | Batch pequeño PASS. |
| 7 | `ops(data): validate discovery across writer-supported sources` | ops | Carrefour/Vea/Disco/Jumbo/MAS cubiertos. |
| 8 | `feat(data): add discovery freshness bridge and recovery gate` | feature | Discovered rows integradas a refresh-existing y freshness SLO. |
| 9 | `perf(data): add discovery scale performance validation` | perf | Validacion de escala contra baselines pre-write para VTEX/Prisma/PriceHistory/public APIs. |
| 10 | `feat(data): add discovery alerts and rollback drill certification` | feature | Alerts con SLA/channel/escalation + certificacion final de rollback/no-partial/post-rollback. |
| 11 | `docs(data): design discovery source-scoped cadence` | docs | Cadence plan sin all-source automático. |
| 12 | `ops(data): certify discovery prod-final gate` | ops | Acceptance final con coverage + freshness + ops evidence. |

Cada issue debe ser review-sized. Si supera 400 líneas, usar chained PRs o pedir `size:exception` explícito.

## Goal prompt extendido

El prompt operativo copy/paste-ready vive en `docs/direct-refresh-discovery-prod-final-goal-prompt.md`.

Ese artifact es la unica version extendida del `/goal`; este PRD conserva las reglas, fases y gates como fuente de verdad. Si el prompt y este PRD difieren, se debe corregir el prompt antes de ejecutar.

## Stop rules finales

Stop inmediato si:

- se propone “sólo probar en prod” sin artifact chain;
- se mezcla discovery coverage con freshness success;
- se intenta all-source para ahorrar tiempo;
- se ignora VTEX hash/source health;
- se ejecuta apply sin pre-write foundation PASS;
- se ejecuta apply sin rollback drill ejecutado pre-write;
- se ejecuta apply sin minimum performance guard;
- se llama prod-final sin freshness `>=95%/12h`;
- se usa artifact sin commit/schema/env/source config lineage;
- se escala denominator sin VTEX budget y compliance posture;
- se escriben rows sin postwrite plan;
- se borra por EAN sin IDs;
- se propone rollback sin post-rollback verification;
- se saltea edge cases por “improbables”;
- se cambia código sin test o sin justificación.

Esto no es burocracia. Es la diferencia entre operación productiva y esperanza.
