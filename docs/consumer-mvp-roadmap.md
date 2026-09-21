# Hoja de ruta de consumo y expansión de catálogo

## Norte de producto

ofertaSUPER busca cubrir progresivamente un catálogo casi completo de los supermercados soportados: que una persona encuentre los productos de su compra habitual, compare identidades exactas y decida con precios, disponibilidad observada, fechas y cobertura comprensibles.

**Los 500–1.000 productos iniciales son un conjunto de validación, no el techo del producto.** Primero se demuestra el recorrido y la actualización del corte actual; después se amplían categorías, profundidad y fuentes sin perder esas garantías. Esta dirección incorpora la petición de Mateo del 2026-09-21.

El alcance medible es el catálogo públicamente observable por **supermercado + canal/sitio + seller aplicable + región/sucursal conocida + categorías + ventana de observación**. No equivale al inventario interno ni a todos los locales de Argentina. Un contexto desconocido se informa como desconocido; no se inventa a partir del nombre de la cadena.

## Ruta de ejecución

1. Leer el [ledger ODD](../odd/tasks/consumer-mvp-reset.md): única autoridad de tareas, progreso, evidencia y próximo paso.
2. Consultar la [auditoría del 2026-09-21](reports/engineering-audit/2026-09-21-consumer-mvp-audit.md) como evidencia del SHA auditado, sin asumir que ya se corrigió.
3. Ejecutar el siguiente trabajo elegible de CMVP-04. CMVP-05 queda bloqueado hasta pasar G04.
4. Usar el [contrato de orquestación](../odd/orchestration/consumer-mvp-herdr.md) para delegaciones acotadas. El roadmap fija dirección y criterios, no mantiene un segundo tablero.

## Etapas y límites

| Etapa | Resultado | Puerta de salida |
|---|---|---|
| CMVP-01/02 | Plan y línea de entrega reconciliados | Evidencia histórica preservada en el ledger; no reiniciar el inventario completo sin cambios materiales. |
| CMVP-03 | Catálogo pequeño adquirido | Corte de 500 objetivos, tres fuentes, 167 EAN en al menos dos fuentes y dos ciclos cercanos documentados. Esto no prueba actualización diaria ni despliegue. |
| CMVP-04 | Recorrido público corregido y verificable | G04 del ledger: todos los hallazgos aplicables resueltos, snapshot único, canasta correcta, publicación atribuible y repetición diaria observada. |
| CMVP-05 | Piloto sobre una base verificada | 5–15 participantes; al menos cinco recorridos completos y resultados de búsqueda, cobertura y confianza registrados. |
| CAT-01, después del piloto | Más profundidad en Disco/Jumbo/Carrefour | Categorías y denominadores medidos; incremento de cobertura con frescura y costo sostenibles. |
| CAT-02 | Catálogo observable casi completo por contexto | Criterios de completitud siguientes verificados individualmente por fuente/contexto. |
| CAT-03 | Más supermercados y fuentes complementarias | Contrato de identidad, contexto, costo y actualización de cada incorporación; sin degradar fuentes existentes. |

CAT-01/02/03 son horizontes de producto, no trabajos autorizados para ejecución en esta entrega. El piloto decide el orden de categorías y los gaps de mayor valor; no elimina la ambición de cobertura amplia.

## Alcance del cierre inmediato

- Disco, Jumbo y Carrefour; uso anónimo y canasta local.
- Identidad exacta por EAN/GTIN válido y normalizado. Los atributos opcionales ausentes no se inventan; conflictos explícitos quedan visibles.
- PostgreSQL local adquiere/procesa; un snapshot público inmutable validado alimenta Next/Vercel.
- Supabase permanece como recuperación/exportación temporal; sin nuevo servicio administrado ni eliminación sin paridad de respaldo/exportación.
- Actualización al menos diaria del corte validado, según capacidad demostrada; disponibilidad es una observación, no garantía de checkout.
- SEPA, seis fuentes, coincidencia aproximada, cuentas, checkout y promociones complejas permanecen fuera de CMVP-04/05.
- Pausar nuevas capas de autoridad, respaldo o planificación operativa salvo necesidad demostrada del recorrido. Conservar controles necesarios; no eliminar infraestructura a ciegas.

## Cómo se medirá el crecimiento

Las métricas se publican por fuente/contexto y categoría, con ventana, presupuesto, versión del objetivo y exclusiones. La suma entre fuentes no puede ocultar una fuente sin cobertura o desactualizada.

| Métrica | Definición y denominador |
|---|---|
| Enumeración | Identidades locales de fuente observadas en categorías/paginación, sitemap/feed y otras superficies verificadas; deduplicadas entre superficies. |
| Estado del recorrido | Por categoría/superficie: completo, muestreado, truncado, bloqueado o desconocido; última página observada y límites. |
| Captura | Identidades incorporadas / universo enumerado verificable del mismo contexto y ventana. |
| Cobertura del supermercado | Solo estimable si el recorrido y denominador permiten sostenerla; en caso contrario: no determinada. Capturar el 100 % de una muestra no establece completitud. |
| Elegibilidad de identidad | Fracción con GTIN válido para comparación; los SKU sin GTIN siguen contando como gaps de catálogo, no desaparecen del denominador. |
| Comparación exacta | EAN presentes en dos o más fuentes; separar dos fuentes de tres. |
| Comparación utilizable | EAN con al menos dos ofertas compatibles en contexto, precio válido, disponibilidad elegible y frescura vigente. |
| Frescura | Observaciones vigentes / pares fuente–producto esperados y congelados por fuente/contexto, incluidos los faltantes. Separar productos con alguna observación fresca / todos los productos objetivo. CMVP-04 exige ≥90 % en cada fuente y ≥90 % por producto, con ventana de 24 h. |
| Disponibilidad | Disponible / no disponible / desconocida. La indisponibilidad correctamente observada no es un fallo de captura. |
| Novedad y cambios | Nuevas identidades por petición/tiempo; cambios y desapariciones observadas sin borrar productos por errores de consulta. |
| Capacidad | Peticiones, duración, errores y costo de discovery y refresh por separado; deuda de actualización pendiente. |

La clave de cobertura es una identidad local de fuente —por ejemplo SKU—; la clave de comparación entre fuentes es el GTIN verificado. Un catálogo amplio puede incluir productos aún no comparables, claramente identificados. Esto no autoriza cambiar el modelo de datos del primer MVP: CAT-01 diseña esa extensión cuando corresponda.

## Definición operativa de «casi completo»

**Objetivo provisional de planificación:** capturar al menos el 95 % de un universo público enumerado verificable, por cada fuente/contexto soportado. El 95 % es una propuesta medible para concretar la ambición, no una cifra conseguida ni una promesa aprobada por la fuente. Su ajuste debe conservar razones y no reducir silenciosamente el alcance.

Antes de usar esa expresión se requiere:

1. Recorrer todas las categorías declaradas elegibles sin truncamientos ocultos; publicar las exclusiones junto al resultado y resultados por categoría para que el promedio no oculte huecos. Si se excluyeron categorías, decir «95 % del universo enumerado de las categorías X», sin convertirlo en «95 % del supermercado».
2. Deduplicar identidades y variantes sin fusionar artículos diferentes; mantener separados universo observado, incorporado y comparable.
3. Reconciliar totales de la fuente cuando existan y sean interpretables; contrastar otra superficie disponible. Si no hay contraste o denominador defendible, conservar la limitación y no declarar completitud del supermercado.
4. Mantener la frescura prometida bajo el tamaño adquirido y reportar presupuesto/capacidad por fuente.
5. Versionar denominadores y conjuntos objetivo: una expansión no cambia retroactivamente la base de comparación de ciclos anteriores.

Las búsquedas por una lista de términos sirven para descubrir, pero su bajo rendimiento marginal no demuestra agotamiento del catálogo. Se reutilizan las definiciones de [catálogo observable y denominadores](full-discovery-freshness-architecture.md#definitions), sin activar sus antiguas capas de ejecución ni tomar su «next slice» como la tarea actual.

## Expansión después de CMVP-05

CAT-01 comienza por las categorías que el piloto muestre ausentes o poco cubiertas dentro de las tres fuentes actuales. Cada incremento congela su conjunto objetivo, mide captura/comparación útil, comprueba una actualización posterior y registra costo, errores y gaps. No se fija un salto arbitrario a decenas de miles de productos sin capacidad de refresh demostrada.

CAT-02 amplía ese proceso hasta cubrir el universo verificable. CAT-03 añade fuentes cuando el costo incremental y su aporte a las compras reales lo justifiquen; SEPA puede reevaluarse aquí, con su propio contexto y antigüedad. Incorporar una fuente no habilita mezclar observaciones de sucursales/canales incompatibles.

## Estado y evidencia

La evidencia del corte adquirido está en el [ciclo 2](../artifacts/cmvp/catalog/expansion-20260920-cycle2/gate-report.json). Sus 691 ofertas, 167 comparables y 100 % de frescura describen la medición del 2026-09-20. El ledger registra 537 productos/728 ofertas en la base completa; los denominadores son distintos.

La auditoría posterior confirmó brechas de lectura pública, tests, fechas y canasta. Este cambio documenta cómo cerrarlas: no las declara corregidas ni acredita publicación, Engram sincronizado o piloto ejecutado. El próximo trabajo de implementación es **CMVP-04-T01**, según el ledger.
