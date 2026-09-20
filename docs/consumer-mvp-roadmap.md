# Hoja de ruta del MVP de consumo

Esta hoja de ruta preserva el reinicio de producto aceptado: convertir la base de portafolio/demostración en un MVP pequeño y confiable para consumo. Define la secuencia y sus puertas de resultado; no declara que el catálogo en vivo, la operación recurrente ni el lanzamiento público estén listos.

## Resultado que se busca

Una persona puede buscar un producto real, comparar el mismo producto entre Disco, Jumbo y Carrefour, entender la frescura y disponibilidad observada, añadir productos a una canasta local y comparar los totales de esa canasta.

## Ruta rápida

1. Consulte el [contrato de ejecución](../odd/tasks/consumer-mvp-reset.md) antes de iniciar cualquier unidad.
2. Complete las unidades en el orden indicado y cierre cada hito por su puerta de resultado, no por cantidad de tareas.
3. Reanude exclusivamente la primera unidad pendiente; T4a está cerrada y T4b requiere autorización separada, sin iniciar adquisición desde fuentes en vivo.

## Alcance aceptado

| Tema | Decisión |
|---|---|
| Supermercados iniciales | Disco, Jumbo y Carrefour. |
| Identidad de producto | Un EAN/GTIN válido y normalizado que coincide establece identidad exacta. Presentación, cantidad, unidad de medida y variante son observaciones opcionales independientes. |
| Catálogo inicial | Entre 500 y 1.000 productos útiles. |
| Actualización | Al menos diaria, según la capacidad de cada fuente. |
| Uso y canasta | Uso público anónimo; la canasta permanece local. |
| Disponibilidad | Es una observación de la fuente, no una garantía de stock ni de inventario para checkout. |

## Hitos y puertas de resultado

| Hito | Resultado | Puerta de salida |
|---|---|---|
| 1. Reconciliar el proyecto | Existe una línea de entrega autoritativa y trazable. | Se declaran la rama base, el trabajo incluido, el pausado y el preservado, además de la secuencia exacta de integración y las comprobaciones de base observadas. |
| 2. Crear un catálogo pequeño en vivo | Los tres supermercados aportan datos recientes y medibles. | Hay 500–1.000 productos útiles, tres fuentes representadas, al menos 100 EAN exactos comparables en dos fuentes, 90 % o más del catálogo objetivo actualizado en 24 horas y dos ejecuciones exitosas consecutivas. |
| 3. Completar el recorrido real de consumo | La experiencia pública usa datos reales con límites honestos. | No se presenta información ilustrativa como real; los totales y cobertura de una canasta de cinco productos son correctos; se verifican el recorrido móvil y los estados degradados en producción. |
| 4. Ejecutar un piloto público controlado | La siguiente inversión se decide con evidencia de personas usuarias. | Al menos cinco de 5–15 personas completan el recorrido; se registran éxito de búsqueda, cobertura de comparación, uso de canasta, abandono y comentarios de confianza; los fallos se clasifican como datos, confianza o interacción. |

## Orden de ejecución: 12 unidades

| Orden | Unidad | Hito | Cierre esperado |
|---:|---|---|---|
| 1 | Inventariar `origin/master`, OS03, ramas, worktrees, cambios OpenSpec y afirmaciones de finalización. | 1 | Inventario verificable sin borrar trabajo ambiguo. |
| 2 | Clasificar trabajo incluido, pausado y preservado; seleccionar la línea autoritativa. | 1 | Decisión de línea y límites explícitos. |
| 3 | Preparar la secuencia de integración y observar las comprobaciones de base. | 1 | Puerta del hito 1 satisfecha. |
| 4 | Confirmar capacidad de fuente y contrato de observación para Disco, Jumbo y Carrefour. | 2 | Límites de actualización y disponibilidad documentados por fuente. |
| 5 | Producir el corte inicial de catálogo con coincidencias exactas. | 2 | Datos útiles de las tres fuentes disponibles para medir. |
| 6 | Medir cobertura, frescura y dos ejecuciones consecutivas. | 2 | Puerta del hito 2 satisfecha. |
| 7 | Conectar las superficies públicas al catálogo vivo con límites de veracidad explícitos. | 3 | Ningún dato ilustrativo se presenta como real. |
| 8 | Verificar búsqueda y comparación de producto exacto, frescura y disponibilidad observada. | 3 | Recorrido de comparación correcto. |
| 9 | Verificar canasta local, totales, cobertura, móvil y estados degradados. | 3 | Puerta del hito 3 satisfecha. |
| 10 | Preparar la observación acotada del piloto para 5–15 personas. | 4 | Métricas y clasificación de fallos listas para observar. |
| 11 | Observar el recorrido completo con al menos cinco personas externas. | 4 | Evidencia de uso y confianza registrada. |
| 12 | Clasificar los resultados y decidir la próxima inversión de producto. | 4 | Puerta del hito 4 satisfecha. |

## Authority and public read path

- Local PostgreSQL is the acquisition and processing authority.
- A validated immutable static snapshot is the public Next.js/Vercel read surface.
- Supabase is temporary recovery/export only; it will not be upgraded to Pro and does not block CMVP-03.
- Do not delete Supabase until backup/export parity has been observed.
- Do not add another managed database.

## CMVP-03 bounded progress

- **CMVP-03-T1 is complete:** the frozen-manifest/snapshot gate reporter records exact-identity proof, deterministic freshness and representation, diagnostics, and exclusions.
- **CMVP-03-T2 is complete:** the offline snapshot generator feeds that gate and corrects equal `source:targetId` ordering by sorting complete serialized offers independently of repository/DB return order; its final checks are recorded in the ledger.
- **CMVP-03-T3 is complete:** local PostgreSQL bootstrap and fixture/seed-to-snapshot proof is closed in the durable ledger.
- **CMVP-03-T4a is complete:** the snapshot and gate use valid normalized EAN/GTIN alone for exact identity. Optional pack, quantity, measurement unit, and variant remain nullable source observations; they are neither inferred nor copied from targets, and explicit conflicts remain deterministic diagnostics. T4b is not started.

## Dejar de hacer por ahora

- No ampliar a seis supermercados hasta que el corte inicial de tres fuentes sea creíble.
- No introducir coincidencias aproximadas de productos en el primer MVP.
- No añadir cuentas de consumo, checkout, promociones complejas ni administración avanzada.
- No crear nuevas capas de autoridad de publicación, recuperación, respaldo, auditoría u operación salvo que el corte actual de consumo las requiera de forma demostrable.
- No eliminar ramas ni worktrees ambiguos antes de clasificarlos durante la reconciliación.
- No sustituir puertas de resultado por el recuento de tareas completadas.

## Autoridad y reanudación

El [ledger de ODD](../odd/tasks/consumer-mvp-reset.md) es el contrato operativo y el registro de progreso y evidencia. Esta hoja de ruta fija el alcance, los hitos, las puertas y el orden aceptados. Si ambos documentos difieren, detenga el avance y reconcilie el ledger con evidencia observada; no reabra decisiones de producto aceptadas sin nueva autorización.

Para reanudar:

1. Lea el ledger y consulte su espejo de Engram `odd/consumer-mvp-reset/tasks`.
2. Reconciliar ambas copias, inspeccionar el estado actual de Git y revisar la evidencia más reciente de la primera tarea sin marcar.
3. Continúe solo esa tarea, actualizando el ledger, su espejo y la proyección visible de tareas tras cada transición o cambio material del plan.
4. No salte puertas de resultado ni inicie el siguiente hito hasta observar la evidencia de salida del actual.

## Siguiente paso inmediato

Plan and execute only when separately authorized **CMVP-03-T4b**. T4a does not authorize live acquisition, a public deployment, a Supabase deletion, another managed database, or any scope beyond the accepted EAN-only identity policy.
