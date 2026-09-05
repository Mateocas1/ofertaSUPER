# ofertasSUPER: auditoría, discovery y freshness

**Estado:** propuesta de coordinación, no autorización de implementación ni aceptación de producción. **Fecha:** 2026-09-05.
**Tracker:** [#460](https://github.com/Mateocas1/ofertaSUPER/issues/460). **Base examinada:** `b999298b755288d47c645185e00e154f62b9aca1`.
**Ejecución:** [runbook del agente](2026-09-05-agent-runbook.md). El tracker mantiene estados y evidencia; este documento mantiene contratos, dependencias y criterios.

## 1. Resultado perseguido y límites de esta planificación

Consolidar las dos revisiones: corregir inconsistencias de producto y autoridad, simplificar código sin quitar garantías y demostrar discovery → publicación → refresh sostenido en un alcance explícito. Después ampliar fuentes y contextos que podamos mantener.
Las revisiones fueron selectivas: código/diffs concretos, cuatro issues abiertos y 35 cuerpos de PR recientes; no todos los diffs ni todo el histórico. Los resultados anteriores de CI no son ejecuciones nuevas de esta planificación. No se verificó aquí el catálogo live ni el ZIP diario SEPA.
No se propone reescritura, microservicios, un framework de proveedores, un analizador nuevo ni un scheduler paralelo. Una unidad OS puede requerir varios PR pequeños; no equivale automáticamente a un PR ni justifica crear 18 issues de antemano.
Los contratos existentes conservan autoridad. Este plan no amplía #395, #459 o el probe Jumbo. Cambiar sus límites requiere decisión y aprobación específicas antes de ejecutar. Un conflicto de alcance se resuelve, no se ignora.

### Evidencia y trazabilidad de ambas revisiones

| ID | Hallazgo o decisión pendiente | Calidad de evidencia y trabajo asociado |
|---|---|---|
| A1 | Home con constantes y botones Agregar sin acción en el componente revisado; sí hay aviso ilustrativo. | Inspección de código [R1]. OS-02; no se declara incidente live. |
| A2 | Search sirve caché reclasificada por fecha antes de consultar autoridad vigente. | Rama observada; revocación no reproducida en producción [R2]. OS-03. |
| A3 | Dos familias de mapeadores repetidas en cinco escritores. | Baseline con huellas iguales y lectura de Carrefour/Jumbo [R3]. OS-05. |
| A4 | README: Next 15 y demo offline frente a paquete 16.3.1 y rutas estrictas. | Divergencia documental [R4]. OS-00. |
| A5 | 131 hotspots: 130 ciclomáticos, 42 cognitivos, con superposición; 96 en scripts, 35 en src. | Log histórico del PR #458, no medición actual [R5]. OS-05/06. |
| A6 | El job histórico imprimió 34 avisos de dependencias de todo el árbol instalado. | No son 34 vulnerabilidades productivas demostradas. Separar dev/prod y reauditar snapshot. OS-07. |
| A7 | Fixtures, checks y código integrado no prueban integración real ni lanzamiento. | Cadena de PR #415–#458 e issue #405 [R6]. OS-07/12/15. |
| D1 | Coverage operacional ≥80%; final ≥95%. Recovery ≥90%/24h; final ≥95%/12h por fuente y agregado. | Objetivos del PRD/plan, no resultados alcanzados [R7]. OS-01/10/13. |
| D2 | Categorías ya generaron candidatos útiles; no acreditan agotamiento completo ni capacidad actual. | Evidencia histórica, con muestras superpuestas [R8]. Reutilizar en OS-10. |
| D3 | SEPA diario y VTEX selectivo no garantizan por sí solos ≥95%/12h sobre todo el universo. | Diferencia de semántica y capacidad [R7], [R9], [E3]. OS-01/04/13. |
| D4 | Precio regional necesita fuente, canal, contexto y vendedor; la clave actual es EAN + supermercado. | Schema y contratos actuales [R10]. OS-08/09. |
| D5 | API v1 merece comparación, no migración automática. | VTEX documenta v1, contexto explícito y caché [E1]; disponibilidad por cadena sin probar. OS-08. |
| D6 | Ampliar discovery crea nueva deuda de mantenimiento; no alcanza un batch exitoso. | Hipótesis operacional a medir, no capacidad afirmada. OS-12/13/14/15. |

El log de complejidad [R5] analizó `fc76c36640fd2b122914740e2d30ffaccd2cb5d9`, merge temporal del PR #458; no el SHA final de master. Umbrales existentes: ciclomática 10, cognitiva 15. Un PASS de baseline no significa deuda cero. No reutilizar identificadores abreviados de informes como IDs del ratchet.

### Reutilizar y reconciliar los issues existentes

| Issue | Se conserva | Tratamiento en este plan |
|---|---|---|
| [#405](https://github.com/Mateocas1/ofertaSUPER/issues/405) | Aceptación operativa y dos shadows Disco, escritura limitada, siete ciclos de 24h, go/no-go. | OS-12/14/15; no duplicar su checklist de operación. |
| [#395](https://github.com/Mateocas1/ofertaSUPER/issues/395) | Admisión Next 16, recursos no productivos y allowlist propia. | OS-07 primero contrasta lo pendiente con código posterior. |
| [#459](https://github.com/Mateocas1/ofertaSUPER/issues/459) | Coto Botánico 203, GTIN 7790742335500, observación independiente. | OS-11 no agrega descarga nacional, ranking, canasta ni otra sucursal. |
| [#337](https://github.com/Mateocas1/ofertaSUPER/issues/337) | Bloqueo de archivo SDD y su evidencia. | OS-17 verifica estado actual; no falsea PASS ni modifica archivos históricos para destrabar. |

El comentario de #405 [R11] registra backup cifrado y restore descartable satisfactorios, ocho migraciones y drift corregido. Es evidencia ya conseguida: comprobar su vigencia para el nuevo candidato, no reconstruirla como si no existiera ni confundirla con un backup reciente.

## 2. Contratos transversales que cada unidad debe conservar

| Contrato | Invariante verificable |
|---|---|
| C1. Alcance | Cada ejecución identifica fuente, canal, contexto, cohorte, ambiente, propósito y presupuesto. DIA sigue audit-only/no-writer. No equivaler seis fuentes configuradas a seis operativas. |
| C2. Identidad | EAN/GTIN como cadena, presentación/unidad y SKU compatibles; conservar ceros. No elegir el primer SKU ni el precio mínimo de cualquier seller. Ambigüedad impide precio comparable y creación. |
| C3. Escritura | Discovery puede crear solo lo planeado; refresh-existing no crea. Identidad exacta, constraints, transacción, lock, idempotencia, prewrite vigente, postwrite y rollback por IDs. No deletes amplios por EAN. |
| C4. Publicación y caché | La fecha de un payload no le da autoridad. Revocación, reemplazo de publicación, deployment y contexto se verifican también con caché caliente. Fallar cerrado no significa inventar datos. |
| C5. Tiempo | Distinguir fecha de fuente, adquisición, verificación y publicación. Descarga/reprocesamiento no rejuvenece observaciones. Rechazar fechas futuras fuera de tolerancia explícita; no convertirlas silenciosamente en edad cero. |
| C6. Comparabilidad | SEPA fechado no implica stock, precio web o promoción universal. No sumar precios de contextos incompatibles. Canasta incompleta no gana por omitir faltantes; promos dependen de cantidad, elegibilidad y condiciones. |
| C7. Red y fuentes | Hosts/superficies permitidos, solicitudes/intentos/tiempo/concurrencia acotados, stop por bloqueo. Sin evasión, credenciales privadas del comercio ni ampliación silenciosa de superficie. |
| C8. Complejidad | Conservar analizador y umbrales; no inflar baseline, ocultar warnings o introducir helpers opacos para bajar puntuación. Medir duplicación y legibilidad junto a las métricas. |
| C9. Evidencia | Identificar SHA, ambiente no secreto, comando, fecha, entradas y resultado. Mocks, integración aislada y pruebas live se etiquetan distinto. No registrar cookies, tokens, URLs con credenciales ni cuerpos prohibidos por el contrato. |
| C10. Autoridad | Merge documental ≠ aprobación de código ≠ permiso live ≠ permiso de escritura ≠ lanzamiento. Reusar controles; no crear burocracia duplicada para verificar lo que ya tiene evidencia suficiente. |

**SLO a decidir en OS-01:** mantener ≥95%/12h sobre una cohorte web explícita o adoptar un producto con dos compromisos: edición diaria SEPA y verificación web de un subconjunto. Recomendación inicial: dos compromisos visibles. Cambiar el universo o el objetivo original requiere decisión explícita; no permite afirmar cumplimiento del PRD original por sustitución.

**Métricas mínimas:** `coverage = identidades cubiertas ∩ denominador observado / denominador observado`; registrar contexto, ventana, exclusiones y si el recorrido quedó capped. Eso mide cobertura de lo observado, no del catálogo interno. Reportar también avance de enumeración y huecos conocidos.
`freshness_H(t) = observaciones elegibles de la cohorte con comprobación válida de edad < H / cohorte elegible declarada`. Congelar/versionar el denominador; no eliminar filas solo porque envejecieron o dejaron de rankear. Cero filas produce no-evaluable, no 100%.
Medir freshness por fuente y en el tiempo, no solo al terminar un batch. Una lectura nueva de un dato cacheado por el proveedor no prueba su actualización interna; leer metadatos disponibles y explicitar el límite. Una fecha SEPA sin hora no se transforma en una hora inventada.

## 3. Secuencia de hitos y dependencias

| Hito | Unidades | Gate de salida |
|---|---|---|
| M0. Estado y alcance | OS-00 → OS-01 | Evidencia reconciliada y decisión comercial/SLO registrada. |
| M1. Producto y autoridad | OS-02/03/04/05/07 | CTA honesto, revocación probada, semántica temporal y escritores preservados; admisión del candidato según alcance. |
| M2. Fuente y discovery | OS-08 → OS-09 → OS-10 | Contexto e identidad demostrables; denominador y presupuesto medidos. No producción por este hito. |
| M-SEPA. Observación aislada | OS-11 sobre #459 | Prueba exacta de sucursal/fecha sin contaminación de dominios. No bloquea piloto web si SEPA no es parte de su alcance. |
| M3. Ciclo completo | M1 + M2 → OS-12 → OS-13 | Crear/publicar/refrescar/degradar probado y capacidad sostenible evaluada. |
| M4. Operación acotada | OS-14 → OS-15, dentro de #405 | Programación autorizada, siete ciclos reales y go/no-go para el alcance comprobado. |
| M5. Expansión | OS-16 | Cada fuente/contexto adicional demuestra capacidad sin degradar lo anterior. |
| Mantenimiento lateral | OS-06 y OS-17 | Reducción de deuda/tooling por unidad; no exigir limpiar los 131 hotspots para probar el producto. |

Es una secuencia de dependencias, no fechas de entrega inventadas. Los siete ciclos reales son una ventana de evidencia, no una estimación de desarrollo. Con un agente, WIP recomendado = 1; las ramas paralelas son opciones de planificación, no permiso de ejecutar todas.
La ruta Disco operacional y el diagnóstico Jumbo son distintos. No se obliga a Disco a esperar un protocolo exclusivo de Jumbo: OS-08/09/10 se cierran por la fuente elegida. Un problema aislado de otra cadena no debe bloquearla sin una dependencia real.

## 4. Paquetes de trabajo

### OS-00 — Reconciliar estado, onboarding y backlog
**Dependencias:** ninguna. **Prioridad:** primera. **Modo:** lectura y documentación.
**Entrada y alcance:** SHA real, README, package.json, #405/#395/#459/#337, planes y evidencia [R4]–[R11]. Comparar el snapshot auditado con HEAD antes de reutilizar conclusiones.
**Idea:** una tabla vigente separa implementado, probado en aislado, observado live, aceptado y bloqueado. Corregir onboarding sin credenciales para reflejar el estado unavailable actual donde corresponda.
**Gate de éxito:** cada afirmación de estado tiene referencia/fecha; no aparece Next 15 como stack actual ni se promete fallback eliminado; backup/restore queda reconocido con sus límites; cada pendiente tiene dueño por asignar o confirmado.
**Evidencia de cierre:** diff documental y matriz criterio existente → evidencia → pendiente. Buscar duplicados abiertos/cerrados antes de crear un issue de implementación.
**Límite/stop/rollback:** no cerrar ni relabelar issues existentes por inferencia; no tocar código/DB ni reescribir archivos históricos. Revertir solo la corrección documental si fuera incorrecta.

### OS-01 — Decidir promesa comercial, contexto y SLO
**Dependencias:** OS-00. **Modo:** decisión de producto/arquitectura, sin ejecución live.
**Entrada y alcance:** objetivos originales [R7], frontera SEPA/VTEX [R9], schema [R10]. Elegir fuente inicial, canal, contexto geográfico, cohorte y trato de datos históricos.
**Idea:** un registro de decisión compara conservar ≥95%/12h global del alcance original frente a dos compromisos explícitos. Una región VTEX no es automáticamente una sucursal SEPA ni sus IDs son equivalentes entre tiendas.
**Gate de éxito:** alcance, exclusiones contadas, reglas de precio/promoción/canasta, ventanas y denominadores están aprobados; ejemplos muestran qué se publica y qué no. El objetivo original no se sustituye en silencio.
**Evidencia de cierre:** decisión con alternativa rechazada, costo/riesgo, responsable y condición de revisión; si se cambia un contrato canónico, incluir su actualización autorizada.
**Límite/stop/rollback:** sin decisión, bloquear expansión y claims nuevos, no correcciones independientes de home. Revertir una decisión exige reevaluar sus dependientes; no basta cambiar un título.

### OS-02 — Home honesta y acciones reales
**Dependencias:** OS-00. **Modo:** código/UI y tests aislados. **Prioridad:** alta.
**Entrada y alcance:** `src/app/page.tsx`, `src/lib/home-ui-data.ts` y tests pertinentes [R1].
**Idea:** corrección mínima: ejemplo identificado, CTA funcional a búsqueda o deshabilitado explícito; datos ilustrativos nunca llamados canasta personal. Datos reales después, mediante la autoridad pública y una isla cliente pequeña.
**Gate de éxito:** cada CTA tiene prueba de conducta; ninguna serie decorativa se atribuye a datos observados; se mantiene búsqueda funcional; estado unavailable y aviso son accesibles también en móvil.
**Evidencia de cierre:** pruebas de interacción y render, no solo búsqueda de strings; capturas de ejemplo y unavailable cuando el navegador esté autorizado.
**Límite/stop/rollback:** no rediseño general ni ingestión/schema. Revertir solo UI; si vuelve a exponer una afirmación falsa, desactivar el bloque antes de publicarlo.

### OS-03 — Autoridad vigente con caché caliente
**Dependencias:** OS-00. **Modo:** reproducción aislada → corrección → integración Redis autorizada.
**Entrada y alcance:** search, publicación, claves y consumidores relevantes [R2]. El riesgo es inferido; escribir la reproducción antes de declararlo incidente confirmado.
**Idea:** obtener autoridad vigente y validar identidad/generación de publicación antes del cache-hit. Otra estrategia solo si demuestra revocación equivalente; TTL de 300s por sí solo no alcanza.
**Gate de éxito:** promover → cachear → revocar → nueva solicitud niega el dato anterior; probar publicación reemplazada, deployment/contexto ajeno, autoridad caída, timestamp futuro y concurrencia. Definir punto de consistencia y retraso permitido; propuesta inicial: solicitudes iniciadas después de revocación confirmada no sirven la publicación revocada.
**Evidencia de cierre:** RED/GREEN de ruta con caché persistente, contrato temporal aprobado, efectos medidos sobre lecturas/latencia. Revisar otras cachés sin afirmar que todas tienen el mismo defecto.
**Límite/stop/rollback:** no purge de producción. Si hay duda de autoridad, unavailable. Un rollback no debe rehabilitar caché revocada: mantener la frontera de denegación hasta corregir.

### OS-04 — Tiempo y elegibilidad coherentes
**Dependencias:** OS-01. **Modo:** funciones de dominio/API/UI y tests con reloj controlado.
**Entrada y alcance:** `price-freshness.ts`, readiness pública, policies de catálogo, canasta e historial. La implementación observada usa `Math.max(0, edad)`; probar explícitamente fechas futuras [R12].
**Idea:** separar instante de verificación, fecha de fuente, adquisición y publicación; revalidar elegibilidad por entrada, no solo el envelope cacheado. Conservar precisión diaria cuando no exista hora.
**Gate de éxito:** casos justo antes/en 12h y 24h, fecha inválida/futura, reproceso y fallo de consulta; un intento fallido no rejuvenece el último precio. Canasta parcial no gana por omitir faltantes y promociones condicionales no se vuelven universales.
**Evidencia de cierre:** tablas de casos con reloj inyectado, misma decisión en búsqueda/detalle/canasta/SEO, contrato de precisión temporal y ausencia de claims falsos.
**Límite/stop/rollback:** no backfill de timestamps para conseguir verde. Migraciones, si fueran indispensables, en una unidad autorizada. Mantener presentación histórica ante incertidumbre.

### OS-05 — Deduplicar los mapeadores de cinco escritores
**Dependencias:** OS-00. **Modo:** refactor sin escrituras reales.
**Entrada y alcance:** `productUpdateData` y `supermarketProductUpdateData` en Carrefour, Disco, Jumbo, Más y Vea [R3]. Comparar cinco cuerpos completos antes de extraer.
**Idea:** dos mapeadores tipados compartidos y wrappers específicos; no factory/jerarquía genérica. Separar equivalencia del refactor de un eventual endurecimiento de coerciones.
**Gate de éxito:** misma salida para null, cero, false, imágenes, decimales y secuencias de cambios admitidos; las cinco cadenas consumen una implementación por regla; identidad, locks, transacciones, historial y prewrite quedan intactos.
**Evidencia de cierre:** caracterización antes/después, typecheck y auditoría de complejidad exacta. Si un traslado crea un nuevo ID sobre umbral, simplificar o tramitar la excepción prevista; no rebaselinar.
**Límite/stop/rollback:** mover líneas también consume presupuesto; dividir por consumidores cuando haga falta sin formatos comprimidos. Rollback de código antes de operar; no necesita revertir datos si no hubo writes.

### OS-06 — Hotspots y código sin consumidores
**Dependencias:** OS-00/05. **Modo:** mantenimiento lateral, una responsabilidad por PR.
**Entrada y alcance:** medir HEAD; candidatos `ingest.main`, `evaluateProductionGate`, validación de capacity/lineage, candidate-audit y postwrite [R5]. Su métrica no prueba un bug semántico.
**Idea:** priorizar duplicación, frecuencia de cambio y riesgo. Separar fases comprensibles; comprobar entrypoints Next, CLI, workflows, tests y cargas dinámicas antes de eliminar código.
**Gate de éxito:** cada eliminación tiene inventario de consumidores y pruebas; cada extracción mejora explicación de la regla y medición de deuda sin desplazarla a helpers opacos. Sin excepciones ocultas ni aumento de umbrales.
**Evidencia de cierre:** reporte antes/después, tests de comportamiento, justificación de legibilidad y lista de archivos retirados con sus reemplazos.
**Límite/stop/rollback:** no objetivo arbitrario de líneas borradas ni exigir deuda cero. Si el consumo es incierto, conservar y registrar pregunta. Revertir una unidad aislada, no toda la campaña.

### OS-07 — Seguridad y admisión del candidato
**Dependencias:** OS-00. **Modo:** reconciliación, luego implementación/verificación dentro de #395.
**Entrada y alcance:** lockfile y runtime exactos, #395/#378, CI histórico [R5]. Conservar recursos autorizados y allowlist del issue; ampliar solo por nueva aprobación.
**Idea:** separar auditoría completa y producción, rutas afectadas y explotabilidad investigada; no usar el resumen histórico como diagnóstico actual. Reutilizar evidencia vigente y producir solo la que falte.
**Gate de éxito:** criterios de #395 trazados; auditoría productiva satisface su gate de cero hallazgos; admin autorizado, no-admin denegado y anónimo protegido, catálogo no-demo e imagen real probados en entorno permitido y ligados al snapshot.
**Evidencia de cierre:** JSON de auditoría fechado, resultados de auth/catálogo/navegador y hashes no secretos. Una actualización de dependencia no acredita por sí sola admisión ni rollout.
**Límite/stop/rollback:** sin `audit fix --force`, credenciales en fixtures, recursos productivos o bypass de claims. Si faltan recursos, bloquear ese gate; no inventar evidencia. Rollback a candidato seguro, no a versión vulnerable por defecto.

### OS-08 — Contexto VTEX y evaluación de API v1
**Dependencias:** OS-01. **Modo:** documentación/pruebas inyectadas; live separado y acotado por fuente.
**Entrada y alcance:** spec actual del probe, adapters, superficie pública y documentación oficial [R9], [E1], [E2]. La nota oficial del 2026-07-08 documenta v1, pero no demuestra soporte en cada cadena.
**Idea:** prueba positiva con EAN conocido y comparación manual bajo contexto equivalente; diferenciar bootstrap, prueba regional y lectura. Evaluar v1 versus ruta actual por identidad, seller, precio, caché y yield, no por novedad.
**Gate de éxito:** por fuente/capacidad, resultado soportado/no soportado/no demostrado con evidencia. Para Jumbo existente: CP1425/CP5000, máximo seis requests, sin retries, sin ampliar el probe; si ambas regiones coinciden no afirmar ausencia regional independiente.
**Evidencia de cierre:** tabla de capacidades y presupuesto medido, sin cookies/cuerpos prohibidos. v1 exige contexto explícito y lectura de Cache-Control; no es fallback automático de GraphQL/Legacy.
**Límite/stop/rollback:** presupuestos, hosts y permiso faltantes bloquean live; 403/429/captcha detienen la fuente. No mutar el probe para transformarlo en discovery; nueva capacidad requiere contrato separado.

### OS-09 — Identidad, seller y contexto persistible
**Dependencias:** OS-01/08 para la fuente elegida. **Modo:** diseño mínimo, tests y schema solo si aprobado.
**Entrada y alcance:** normalización y `@@unique([product_ean, supermarket_id])` [R10]. Esa identidad no representa dos precios regionales simultáneos de la misma cadena/EAN.
**Idea:** primer piloto con un contexto documentado por fuente; antes de multirregión, separar observación y proyección comparable. Modelo mínimo incluye fuente/canal/contexto/identidad/fecha/condiciones, sin framework anticipado.
**Gate de éxito:** no colisionan ni se sobrescriben contextos; GTIN/SKU/presentación/moneda/seller se comprueban; evidencia solo de producto no presta precio de otro SKU; SEPA no llena disponibilidad desconocida con true.
**Evidencia de cierre:** casos de variantes, ceros iniciales, packs, sellers y conflictos; decisión de key; si cambia schema, prueba de migración/concurrencia y plan de compatibilidad.
**Límite/stop/rollback:** no unir sucursal SEPA y región VTEX por parecido del nombre; no deducir stock exacto. Rollback preserva observaciones e identidades; evitar eliminación destructiva de columnas como respuesta inicial.

### OS-10 — Discovery medido, no enumeración supuesta
**Dependencias:** OS-08/09 para la fuente elegida. **Modo:** auditoría read-only con budget aprobado.
**Entrada y alcance:** reutilizar CoverageAudit, category-pagination y catalog-comparison existentes [R7], [R8]. Refrescar evidencia histórica caducada antes de utilizarla para una decisión live.
**Idea:** empezar por categorías/particiones; agregar sitemap/feed público o búsquedas solo cuando aporten yield marginal. Lookup directo verifica conocidos, no descubre desconocidos por sí solo. Un candidato likely-missing no es ausencia confirmada.
**Gate de éxito:** denominador único por fuente/superficie/contexto/ventana; known/missing/conflicting/excluded contados; overlap deduplicado; cap alcanzado se distingue de agotamiento real; ausencia en una muestra no inactiva productos.
**Evidencia de cierre:** manifiesto de alcance, requests/intentos/errores/yield, gaps y confianza; mapa de candidatos hacia gates de creación. No extrapolar límites de Legacy a otra API ni sumar muestras solapadas.
**Límite/stop/rollback:** sin writes/staging/cache purge. Capped puede ser una auditoría útil, no cobertura completa; bloqueo proveedor exige stop, nunca evasión. Invalidar el informe defectuoso, no borrar catálogo.

### OS-11 — SEPA aislado: ejecutar #459 sin ampliarlo
**Dependencias:** OS-00 y autorizaciones de #459. **Modo:** sus 11 unidades existentes, no cadena nueva duplicada.
**Entrada y alcance:** evidencia Coto inner-ZIP suministrada manualmente, Botánico 203 y GTIN 7790742335500 [R13]. No se presupone descarga nacional operativa.
**Idea:** lector acotado, observación exitosa inmutable y tarjeta independiente. Comprobar procedencia, fecha, precisión, sucursal y precio; nunca rejuvenecer la edición al descargarla.
**Gate de éxito:** pruebas de tamaño/memoria, CRC, entradas inesperadas y traversal conforme al gate original; duplicación/concurrencia controladas; fallos manejados no dejan estado controlado por esta capacidad; stock no informado y promociones no evaluadas visibles.
**Evidencia de cierre:** casos sintéticos seguros, DB aislada y tarjeta; ausencia probada de efectos en ofertas, canasta, agregados, historial, SEO/JSON-LD y VTEX. Conservar los gates previos del issue antes del lector de archivos.
**Límite/stop/rollback:** sin otra sucursal/producto, scheduler o downloader. Una ampliación futura vive en OS-16 con aprobación propia. Rollback por la frontera aislada y política de registros inmutables, no deletes genéricos.

### OS-12 — Ciclo completo de discovery y mantenimiento
**Dependencias:** OS-02/03/04/05/07/09/10 para el alcance; permisos y pre-write foundation de #405/PRD.
**Entrada y alcance:** primero ambiente aislado; luego piloto real separado. Verificar constraints, estado migratorio, pool/timeout, lock/ledger, idempotencia, preimagen, rollback drill y vigencia de recovery antes de writes [R7], [R11].
**Idea:** source-row count=1, product-and-source count=1, luego count≤5; cada producto vuelve por refresh-existing. Disco es la primera ruta operativa de #405, no un permiso implícito para aplicarle el probe exclusivo de Jumbo.
**Gate de éxito:** creación exacta esperada, sin extras; replay y concurrencia no duplican; postwrite PASS; API/UI muestran identidad/contexto/fecha correctos; refresh actualiza sin crear; vencimiento/revocación/rollback no dejan oferta engañosa.
**Evidencia de cierre:** dos shadows reales y una escritura limitada cuando #405 lo autorice, IDs de efectos, pruebas de fallo intermedio y cleanup. En aislado usar autoridad aislada, no promover producción para hacer pasar un smoke.
**Límite/stop/rollback:** comparar el plan justo antes de escribir; drift/lock fallido/postwrite FAIL detienen. Rollback solo IDs propios y sin referencias posteriores; si hay conflicto, preservar datos y escalar, no borrar por fuerza.

### OS-13 — Capacidad y freshness sostenibles
**Dependencias:** OS-10/12. **Modo:** planificación con mediciones del alcance; pruebas adicionales solo autorizadas.
**Entrada y alcance:** cohorte real producto×fuente×contexto, yield válido, tasa de éxito, duración de ciclo, presupuesto, coste e historial. No tomar conteos de junio como capacidad actual [R7], [R8].
**Idea:** priorizar ofertas, demanda, volatilidad, long tail y desaparecidos en el planner existente. Medir capacidad útil, no solicitudes brutas. Reusar lecturas válidas entre discovery/refresh cuando conserven evidencia y semántica.
**Gate de éxito:** capacidad efectiva de verificaciones distintas > trabajo del objetivo/window + margen declarado; escenarios de caída y crecimiento; ninguna fuente queda oculta por el promedio. Deuda de freshness permite planificar recuperación con safety PASS, no autoriza escribir.
**Evidencia de cierre:** plan con N, porcentaje objetivo, H, presupuesto/hora, relecturas, cola y headroom; crecimiento/retención de PriceHistory y efecto en DB/API. Freshness temporal sobre cohorte estable; SEPA por edición, no por hora de descarga.
**Límite/stop/rollback:** si no da la capacidad, reducir alcance o revisar SLO mediante OS-01; no aumentar carga silenciosamente ni excluir stales para embellecer la métrica. No implementar otro scheduler para eludir inviabilidad.

### OS-14 — Ejecución repetida acotada, no un runner paralelo
**Dependencias:** OS-03/04/07/12/13 y autorización operativa de #405. **Modo:** código default-off; activación separada.
**Entrada y alcance:** ledger/locks/writers/planner existentes y runner de fixtures. El runner shadow actual no acredita capacidad de ejecución real [R6].
**Idea:** un entrypoint que ejecute el plan aprobado con presupuesto por fuente y ventana, revalidando autoridad y kill switch antes de cada batch. Reusar módulos; infraestructura nueva solo con necesidad medida.
**Gate de éxito:** tests de cron solapado, replay, expiración de autorización, crash/reinicio, revocación durante ejecución, timeout y fallo parcial; sin duplicaciones, scope creep ni writes posteriores al stop. Toda acción y reanudación queda trazable.
**Evidencia de cierre:** pruebas con dependencias aisladas y ejecución controlada autorizada; control de procesos/recursos y presupuesto; alerta entregada y responsable identificado, no solo función de alerta existente.
**Límite/stop/rollback:** merge no activa schedule. No ampliar retries de contratos que los prohíben. Desactivar disparador, detener nuevos batches y conciliar los iniciados antes de cualquier rollback de datos.

### OS-15 — Operación, siete ciclos reales y go/no-go
**Dependencias:** OS-14, gates vigentes de #405 y los del candidato; OS-11 solo si SEPA forma parte del lanzamiento.
**Entrada y alcance:** deployment/SHA revisado, identidades mínimas, ventana de soporte, autorización con caducidad, rollback y recuperación vigentes, medición aprobada antes del inicio.
**Idea:** observar siete ciclos reales de 24h con muestreo y presupuesto predefinidos. La cadencia técnica aprobada para recoger evidencia no equivale a lanzamiento general.
**Gate de éxito:** cada fuente cumple el SLO/cohorte aprobado durante la ventana medida; huecos de telemetría son no-evaluables; alertas/revocación/recovery funcionan; no incidentes críticos abiertos; decisión humana deployment-bound registrada.
**Evidencia de cierre:** series por fuente, timestamps, fallos, coste, cambios de estado y go/no-go con alcance. Cambios materiales de candidato/contexto requieren revalidar y repetir la evidencia afectada; no mezclar snapshots para completar casillas.
**Límite/stop/rollback:** mocks o siete ejecuciones seguidas no reemplazan siete días. Gate fallido = no-go; no bajar objetivo retroactivamente. Pausar publicación/cadencia de alcance afectado, conservar historia y ejecutar recuperación autorizada.

### OS-16 — Expandir fuentes/contextos y SEPA por evidencia
**Dependencias:** OS-15 para el alcance ya operado; OS-11 antes de ampliar SEPA. **Modo:** propuesta y pilotos separados.
**Entrada y alcance:** capacidad libre, calidad de matching y límites por fuente. Extender Vea/Carrefour/Más/Jumbo de forma independiente; DIA necesita su habilitación específica, no una bandera global.
**Idea:** repetir gates OS-08/09/10/12/13 en cada contexto nuevo. Para SEPA, medir varias ediciones autorizadas y tamaño/estabilidad antes de proponer downloader; no importar semántica de precio web.
**Gate de éxito:** cada expansión añade observaciones mantenibles, no degrada SLO anterior y contabiliza exclusiones. Integrar precios SEPA a comparación exige contrato nuevo de canal/condiciones y cambios explícitos a la exclusión de #459.
**Evidencia de cierre:** matriz fuente×capacidad×contexto, yield incremental, costes, coverage observado, tiempos y aceptación. Fuentes incompatibles o acceso no permitido quedan excluidos con explicación.
**Límite/stop/rollback:** sin all-source de primer salto ni afirmación de 100% interno. Desactivar la fuente/contexto nuevo y preservar el alcance estable; rollback de datos únicamente si hay corrupción demostrada y plan aprobado.

### OS-17 — Reconciliar tooling SDD sin falsificar evidencia
**Dependencias:** OS-00. **Modo:** lectura/reproducción; prioridad lateral.
**Entrada y alcance:** #337, versión concreta del dispatcher, formato de verify y estado real de sus archivos. Un directorio archive existente no basta para declarar arreglado el parser.
**Idea:** fixture mínimo del falso negativo y arreglo en el componente responsable o vía documentada autorizada; no modificar la aplicación para compensar tooling externo.
**Gate de éxito:** reproducción falla antes y pasa después, o cierre razonado porque fue resuelto con evidencia; no cambiar PASS/READY por conveniencia ni reabrir ciclos históricos terminados.
**Evidencia de cierre:** versión/comando/fixture/resultado y vínculo al arreglo; actualizar #337 solo con permiso de gestión del issue.
**Límite/stop/rollback:** sin archive/reset/override destructivo implícito. Si afecta otro repo, pedir alcance separado. Revertir solo cambio de tooling/configuración autorizado.

## 5. Fuentes y control de cierre

Fuentes del repositorio relativas a este documento; en la revisión se leyeron sobre el SHA indicado arriba. El agente debe contrastarlas con HEAD. Las páginas externas se comprobaron el 2026-09-05; no prueban funcionamiento live de las cadenas.

[R1]: ../../src/app/page.tsx
[R2]: ../../src/app/api/search/route.ts
[R3]: ../../config/complexity-baseline.json
[R4]: ../../README.md
[R5]: https://github.com/Mateocas1/ofertaSUPER/actions/runs/33422960379/job/99589574953
[R6]: https://github.com/Mateocas1/ofertaSUPER/pull/415
[R7]: ../direct-refresh-discovery-prod-final-prd.md
[R8]: ../category-pagination-budget-expansion-evidence.md
[R9]: ../../openspec/specs/vtex-regional-read-probe/spec.md
[R10]: ../../prisma/schema.prisma
[R11]: https://github.com/Mateocas1/ofertaSUPER/issues/405#issuecomment-5460245965
[R12]: ../../src/lib/price-freshness.ts
[R13]: https://github.com/Mateocas1/ofertaSUPER/issues/459
[E1]: https://developers.vtex.com/updates/release-notes/2026-07-08-new-intelligent-search-api-v1
[E2]: https://developers.vtex.com/docs/guides/sessions-system-overview
[E3]: https://www.preciosclaros.gob.ar/

Referencia adicional: [plan de operaciones](../direct-refresh-production-operations-plan.md), [arquitectura discovery](../full-discovery-freshness-architecture.md), [gobierno de complejidad](../policies/complexity-governance.md), [contrato de fuentes DIA](../direct-refresh-dia-posture.md), [paquete](../../package.json), [autoridad pública](../../src/lib/public-catalog-api.ts).
El tracker se cierra solo cuando cada unidad tenga evidencia aceptada o una decisión explícita de diferimiento con impacto. Un diferimiento no satisface gates operativos: el estado de #405 y las afirmaciones públicas siguen dependiendo de resultados reales. El PR documental usa `Refs #460`, nunca cierre automático del programa.
