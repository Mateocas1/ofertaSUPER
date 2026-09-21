# ofertaSUPER — Auditoría para cerrar el MVP de consumo

> Registro histórico del corte auditado. Su incorporación al repositorio no ejecuta las correcciones. El [ledger ODD vigente](../../../odd/tasks/consumer-mvp-reset.md) traduce los hallazgos A01–A16 a CMVP-04 y define la aceptación actual; sus tareas y criterios prevalecen sobre las propuestas de secuencia de este informe.

**Fecha:** 21 de septiembre de 2026.

**Revisión de código:** `master`, `f8d8f4eccf82dfbd35f0c152b42bdb0379747b15`.

**Enfoque:** ingeniería de software y producto; distancia hasta un MVP útil, complejidad proporcional y calidad de entrega.

## Dictamen

ofertaSUPER tiene una base técnica aprovechable, adquisición real de un catálogo acotado y gran parte de la interfaz de consumo. La etapa que falta es conectar esa adquisición a una experiencia pública coherente y comprobar sus reglas de confianza. La infraestructura de publicación, auditoría y operación ha crecido más que el valor visible para quien compara una compra.

Mantendría Next.js, TypeScript, React, Prisma y PostgreSQL. Seguiría la decisión vigente de PostgreSQL local para adquisición y un snapshot público inmutable para Next/Vercel. Detendría la expansión de las capas operativas históricas y usaría CMVP-04 para integrar, corregir y demostrar el recorrido. Después corresponde CMVP-05, el piloto. No asigno un porcentaje de avance: el volumen implementado no mide la distancia hasta que una persona complete una compra comparada.

La auditoría identificó dos errores reproducidos sobre funciones reales: una canasta parcial puede etiquetarse como completa y una reconciliación demorada puede refrescar artificialmente la fecha del precio. También confirmó que CI omite 113 de los 143 archivos de tests y que el despliegue público consultado sigue ofreciendo demostraciones.

[Commit auditado](https://github.com/Mateocas1/ofertaSUPER/commit/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15). [Contrato vigente de producto](https://github.com/Mateocas1/ofertaSUPER/blob/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15/odd/tasks/consumer-mvp-reset.md).

## 1. Qué se revisó y qué se pudo comprobar

Se revisaron documentación actual e histórica, rutas públicas, reglas de catálogo y canasta, normalización e ingesta, publicación y lectura, schema, scripts, métricas de complejidad, PRs, issues y logs de CI. Se clonó el repositorio y se instalaron sus dependencias desde lockfile, sin ejecutar scripts de instalación; se generó Prisma y se corrieron comprobaciones locales. No se modificó código versionado ni se hicieron cambios en GitHub.

| Comprobación | Resultado observado |
|---|---|
| CI del SHA auditado | Success en jobs de complejidad y Lighthouse, incluido build/typecheck/lint |
| Tests invocados por CI | 111 casos: 99 pasan, 12 omitidos, 0 fallan |
| Selección equivalente reproducida localmente | 111 casos: 99 pasan, 12 omitidos, 0 fallan |
| Enumeración explícita de los 143 archivos `.test.ts` | 1.022 casos: 992 pasan, 13 fallan, 17 omitidos |
| Typecheck local | Pasa |
| Auditoría de complejidad local | PASS: 123 funciones heredadas sobre umbral, 0 nuevas, 0 regresiones, 8 resueltas |
| Lint de CI | 0 errores, 182 advertencias |
| Dependencias de producción | npm audit informa 2 paquetes afectados: Next crítico y Sharp alto |
| Lectura del alias público | Home/búsqueda/ofertas accesibles; API de búsqueda responde datos demo |
| Estado Git tras la auditoría | Sin cambios versionados |

La ejecución local utilizó Node 24.19.0; CI utiliza Node 22. El CLI de tsx intenta abrir un socket IPC que este entorno no permite. Se empleó el loader nativo `node --import tsx` para ejecutar los tests sin ese socket. Dos de los 13 fallos ocurren en tests que internamente vuelven a invocar el CLI restringido. Otros comparan contratos antiguos con los archivos actuales; los resultados no significan que existan 13 fallos de producción. No se ejecutaron Docker, una base real del usuario, adquisición externa ni un recorrido móvil de navegador durante esta auditoría.

[CI del SHA exacto](https://github.com/Mateocas1/ofertaSUPER/actions/runs/35563961378). [Job que ejecutó tests, typecheck, lint y build](https://github.com/Mateocas1/ofertaSUPER/actions/runs/35563961378/job/106221982716).

## 2. Objetivo real y avance demostrado

El contrato actual busca que una persona pueda buscar un producto real, comparar el mismo EAN/GTIN entre Disco, Jumbo y Carrefour, comprender fecha y disponibilidad observada, guardar una canasta local anónima y comparar totales y cobertura. El alcance inicial es de 500–1.000 productos; no incluye seis fuentes, cuentas de consumidores, checkout, coincidencia aproximada ni promociones complejas.

El ledger marca CMVP-03 completo y CMVP-04/05 pendientes. El objetivo antiguo de preparación de portfolio en `goal.md` ya no describe por sí solo el siguiente hito. [Alcance e hitos](https://github.com/Mateocas1/ofertaSUPER/blob/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15/odd/tasks/consumer-mvp-reset.md).

### Catálogo del corte versionado

| Métrica | Evidencia del segundo ciclo |
|---|---:|
| Productos objetivo congelados | 500 |
| Ofertas incluidas en ese corte | 691 |
| Ofertas con disponibilidad y precio positivo | 688 |
| Fuentes representadas | 3 |
| EAN en al menos dos fuentes | 167, equivalentes al 33,4 % del corte |
| EAN en las tres fuentes | 24, equivalentes al 4,8 % del corte |
| Frescura de los 500 objetivos al evaluar el ciclo | 100 % dentro de 24 h |
| Repetición del mismo manifiesto | Dos ciclos exitosos |

Los porcentajes de cobertura son cálculos propios sobre el snapshot. El ledger también registra 537 productos y 728 ofertas en la base completa; esas cifras tienen otro denominador y no contradicen las 691 ofertas del corte de 500.

[Reporte del ciclo 2](https://github.com/Mateocas1/ofertaSUPER/blob/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15/artifacts/cmvp/catalog/expansion-20260920-cycle2/gate-report.json). [Snapshot del ciclo 2](https://github.com/Mateocas1/ofertaSUPER/blob/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15/artifacts/cmvp/catalog/expansion-20260920-cycle2/snapshot.json).

Las mediciones de ambos ciclos ocurrieron el 20/09 a las 18:26 y 18:33 UTC. Demuestran repetibilidad cercana, no actualización diaria sostenida. Al comparar las fechas de ese archivo con el 21/09 a las 19:10 UTC, sus 691 observaciones ya superaban 24 horas. Esto describe la evidencia guardada: no permite afirmar que no exista una actualización posterior en la máquina del usuario.

El criterio de adquisición se cumplió, pero 500 productos no significa 500 comparaciones completas. Para el piloto hay que observar listas de compra plausibles y registrar dónde falta cobertura. Elegir cinco EAN favorables sirve para comprobar aritmética; no alcanza para demostrar utilidad de todo el catálogo.

## 3. Hallazgos prioritarios y criterios de cierre

### A. Corregir el alcance de tests antes de confiar en el verde

**Prioridad:** alta para la siguiente integración. **Estado:** confirmado por reproducción y logs de GitHub.

`package.json` contiene `tsx --conditions=react-server --test tests/**/*.test.ts`. El shell de Linux expande el patrón sin incluir los tests que están directamente en `tests/`. De los 143 archivos existentes, 113 están en esa raíz y 30 en subdirectorios. Los 99 casos exitosos de CI coinciden exactamente con la selección parcial reproducida.

La ejecución explícita encontró 1.022 casos y expuso contratos desactualizados. Por ejemplo, `tests/production-dependency-gate.test.ts:37` exige que el build sea exactamente `prisma generate && next build --webpack`, mientras que el build actual añade contrato de catálogo y Serwist. Otro test de Compose exige Redis en una configuración que ahora describe bootstrap local PostgreSQL. Son ejemplos de pruebas que vigilan texto de implementación antigua y que ya no se estaban ejecutando.

**Cierre:** enumeración recursiva determinista desde Node, independiente del shell; todos los archivos esperados incluidos; distinguir suites unitarias, contratos y pruebas que requieren infraestructura. Resolver las diferencias contra el diseño vigente, sin borrar assertions solamente para obtener verde y sin restaurar arquitectura descartada para satisfacer tests viejos. Un caso de comportamiento de canasta debe detectar el error del hallazgo D.

[Script npm](https://github.com/Mateocas1/ofertaSUPER/blob/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15/package.json). [Contrato desactualizado del build](https://github.com/Mateocas1/ofertaSUPER/blob/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15/tests/production-dependency-gate.test.ts). [Workflow](https://github.com/Mateocas1/ofertaSUPER/blob/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15/.github/workflows/lighthouse-ci.yml).

### B. Conectar la adquisición real con la lectura pública aceptada

**Prioridad:** principal brecha de producto. **Estado:** confirmado en código y documentación.

La decisión vigente es PostgreSQL local para adquirir/procesar y un snapshot inmutable validado para la lectura pública. Sin embargo, las páginas actuales siguen usando `servingProduct`/`servingOffer` y una transacción PostgreSQL de autoridad y lectura. `public-catalog-read.server.ts:65–92` muestra esa dependencia. La búsqueda llama a esos loaders en `buscar/page.tsx:25–33`.

El snapshot CMVP actual contiene EAN, fuente, precio, disponibilidad y fechas. No contiene nombre, imagen ni URL de producto. Es adecuado para medir adquisición; todavía no es el contrato completo que necesita la interfaz. Conectar directamente ese JSON dejaría campos esenciales sin resolver.

**Cierre:** un exportador de lectura pública con los campos realmente consumidos por búsqueda, ficha y canasta; una versión coherente del artefacto para las tres superficies; validación de estructura y procedencia; fechas originales por observación y fecha separada de publicación. Conservar estados histórico/no disponible y evitar dependencia de Supabase en cada lectura pública.

El alias `ofertas-super.vercel.app` fue consultado mediante HTTP el 21/09. `/api/search?q=leche` respondió 200 con `dataSource:demo`, `degraded:true` y una fecha `2026-05-14`. La página de búsqueda sí advierte que son ejemplos. `/api/health/catalog` respondió 404. El SHA desplegado no pudo atribuirse, pero el comportamiento observado difiere del contrato no-demo del master actual. La próxima entrega debe verificar el alias final, además del código.

[Decisión de arquitectura](https://github.com/Mateocas1/ofertaSUPER/blob/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15/docs/consumer-mvp-roadmap.md). [Lectura actual](https://github.com/Mateocas1/ofertaSUPER/blob/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15/src/lib/public-catalog-read.server.ts). [API pública consultada](https://ofertas-super.vercel.app/api/search?q=leche).

### C. Una reconciliación puede rejuvenecer un precio sin observarlo de nuevo

**Prioridad:** alta, afecta confianza en los precios. **Estado:** reproducido con la función real y una base simulada en memoria.

`loadCandidates` no selecciona la fecha original de la observación. En `reconcile.ts:525` se genera `new Date()` y en `:548` se escribe como `last_checked_at`. El exportador público de evidencia convierte ese campo en `observedAt`. El runner permite retomar una adquisición ya realizada y reconciliarla después, sin volver a consultar la fuente (`cmvp-catalog-batch.ts:253–260`). Además, el loader convierte estados distintos de REJECTED, incluido PROMOTED, en PENDING.

En la reproducción se inyectó staging del 18/09, se fijó el reloj del proceso al 21/09 y se ejecutó `reconcileStageProducts`. Se escribió el 21/09 como fecha del precio. Una fila ya PROMOTED volvió a ser promovida. La prueba no accedió a una base ni a supermercados reales.

**Cierre:** distinguir fecha de observación de fecha de procesamiento/publicación; conservar la primera durante reanudaciones y reintentos; evitar que repetir promoción rejuvenezca la observación. Añadir una prueba de adquisición vieja más reconciliación posterior y otra de replay. No se afirma que el snapshot actual esté contaminado: se demostró el fallo de la ruta que lo produce.

[Reconciliación](https://github.com/Mateocas1/ofertaSUPER/blob/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15/scripts/pipeline/reconcile.ts). [Reanudación](https://github.com/Mateocas1/ofertaSUPER/blob/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15/scripts/pipeline/cmvp-catalog-batch.ts). [Exportador de fechas](https://github.com/Mateocas1/ofertaSUPER/blob/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15/scripts/audit-cmvp-catalog-snapshot.ts).

### D. La canasta puede decir completa cuando falta un producto

**Prioridad:** alta, afecta la promesa central. **Estado:** reproducido ejecutando las funciones reales del archivo.

`buildSupermarketSummaries`, en `canasta-page.tsx:76–80`, omite los productos que no resolvió la API. No incrementa faltantes por ellos. Luego `missingItems === 0` habilita “Mejor canasta completa”.

Reproducción: canasta con A × 2 y B × 1; respuesta con A a $1.000 en Disco y B ausente. Resultado actual: total $2.000, un producto cubierto, cero faltantes. La advertencia de producto no resuelto no corrige la etiqueta contradictoria.

**Cierre:** el denominador siempre incluye todos los EAN pedidos. Un producto no resuelto cuenta como faltante en cada supermercado. La carga parcial no puede producir una canasta completa. Verificar cantidades, indisponibilidad, caducidad y faltantes en una misma prueba de comportamiento acotada.

[Cálculo y presentación de canasta](https://github.com/Mateocas1/ofertaSUPER/blob/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15/src/components/canasta-page.tsx).

### E. Parchar dependencias de producción antes del próximo despliegue

**Prioridad:** alta antes de publicar. **Estado:** auditoría npm y avisos vigentes contrastados.

El lockfile fija Next 16.3.1 y Sharp 0.35.3. `npm audit --omit=dev --json --ignore-scripts` informó Next crítico y Sharp alto. El aviso de optimización AVIF marca Next 16.3.3 como corregido; el de Sharp marca 0.35.4. El aviso adicional de Next para Windows depende de esa plataforma. No se probó explotación ni se atribuyeron las versiones al alias actualmente desplegado.

**Cierre:** actualización compatible y coordinada de los paquetes Next relacionados, resolver Sharp en el lockfile, repetir auditoría de producción, tests y build del candidato. No requiere una nueva migración de framework. Los componentes revisados usan imágenes `unoptimized`, pero eso no demuestra por sí solo que el endpoint de optimización esté deshabilitado; la configuración permite cualquier hostname HTTPS.

[Aviso oficial de Next](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4). [Aviso de Sharp](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c). [Aviso condicionado a Windows](https://github.com/advisories/GHSA-p293-qw3h-jr36). [Configuración actual](https://github.com/Mateocas1/ofertaSUPER/blob/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15/next.config.ts).

### F. Completar reglas de presentación dentro de CMVP-04

Estos puntos pertenecen al mismo recorrido; no justifican una fase nueva de rediseño.

| Hallazgo | Evidencia y efecto | Cierre acotado |
|---|---|---|
| La ficha oculta la indisponibilidad | El loader de detalle conserva ofertas con `isAvailable:false`; `PriceComparison` no recibe ese campo y la página enumera todas bajo “Disponible en” | Mostrar estado observado y fecha; mantener la exclusión de ofertas no disponibles que ya hace la canasta |
| Solo hay primera página | Búsqueda fija `limit:24,page:1`, sin controles para avanzar; categorías/ofertas repiten la limitación | Paginación sencilla que preserve consulta, fuente y orden |
| Políticas históricas divergentes | Lista elige precio histórico de presentación; detalle público usa solo `fresh[0]`, dejando “Sin precio” aunque haya historial válido | Una función pura compartida para selección y etiqueta de precio |
| Fuentes de UI fuera del alcance | Filtros siguen ofreciendo seis fuentes aunque el MVP acordó tres | Derivar opciones de fuentes presentes en el snapshot |
| Disponibilidad ausente se convierte en true | `vtex/normalize.ts:146` termina con `?? true` | Representar desconocido o no elegible de manera conservadora; no afirmar stock observado sin un dato |
| El gate de adquisición no exige precios útiles comparables | Una copia del snapshot con todos los precios null y disponibilidad false aún da PASS y 167 identidades comparables | Añadir a la aceptación pública comparación con precios válidos, disponibilidad elegible y ventana de frescura; no confundir identidad coincidente con oferta comparable |

El último caso es una debilidad del criterio de aceptación, no prueba de que el snapshot actual tenga 167 comparaciones inválidas. En el archivo real existen 688 ofertas elegibles y 167 EAN con precio en al menos dos fuentes. Tampoco se afirma que el catálogo actual rankee ofertas con disponibilidad explícitamente falsa: sus filtros sí las excluyen.

[Detalle público](https://github.com/Mateocas1/ofertaSUPER/blob/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15/src/lib/portfolio-catalog.ts). [Tabla comparativa](https://github.com/Mateocas1/ofertaSUPER/blob/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15/src/components/price-comparison.tsx). [Búsqueda](https://github.com/Mateocas1/ofertaSUPER/blob/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15/src/app/buscar/page.tsx). [Normalización](https://github.com/Mateocas1/ofertaSUPER/blob/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15/src/lib/vtex/normalize.ts). [Gate](https://github.com/Mateocas1/ofertaSUPER/blob/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15/scripts/pipeline/cmvp-catalog-gate.ts).

## 4. Calidad del código y complejidad proporcional

### Qué está bien encaminado

Hay tipos estrictos, validaciones de identidad, separación entre adquisición y reconciliación, controles transaccionales, checkpoints de reanudación y respuestas conservadoras cuando falta una publicación válida. El cliente batch comprueba correspondencia entre EAN pedidos, devueltos y faltantes. La canasta anónima local reduce dependencias y conserva la lista cuando falla el catálogo. Son decisiones adecuadas al producto; merecen conservarse.

Las pruebas existentes cubren numerosas reglas de negocio y errores de infraestructura. El problema comprobado está en su descubrimiento y en parte de sus contratos desactualizados. La compilación y el typecheck del HEAD pasan: la conclusión no es que todo esté mal escrito.

[Cliente de canasta](https://github.com/Mateocas1/ofertaSUPER/blob/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15/src/lib/basket-products-client.ts). [Política de frescura](https://github.com/Mateocas1/ofertaSUPER/blob/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15/src/lib/catalog-freshness-policy.ts).

### Medición concreta

La auditoría propia del proyecto mide complejidad ciclomática sobre 10 y cognitiva sobre 15. En el HEAD hay 123 funciones que superan al menos un umbral: 95 en scripts y 28 en src. Hay 122 que superan el umbral ciclomático y 41 el cognitivo; estos números se solapan. El gate pasa porque es deuda heredada permitida, no porque todas las funciones sean simples.

| Zona | Observación |
|---|---|
| `src/lib/catalog.ts` | 1.171 líneas y mezcla de consulta/mapeo/políticas |
| `scripts/pipeline/direct-refresh-discovery-prewrite-foundation.ts` | 1.277 líneas |
| Cinco writers direct-refresh | Repiten `supermarketProductUpdateData` con complejidad 18/40 y misma huella estructural |
| `scripts/ingest.ts:main` | Complejidad 23/37 |
| `production-readiness/policy.ts:evaluateProductionGate` | Complejidad 38/36 |

Estas métricas ayudan a localizar coste de mantenimiento; no son un veredicto automático ni un requisito de bajar todos los valores antes de terminar. [Política](https://github.com/Mateocas1/ofertaSUPER/blob/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15/docs/policies/complexity-governance.md). [Baseline](https://github.com/Mateocas1/ofertaSUPER/blob/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15/config/complexity-baseline.json).

### Dónde sí hay sobreingeniería

La coexistencia de ruta histórica de catálogo, proyecciones de publicación gobernada, múltiples writers direct-refresh y la futura ruta de snapshot incrementa los conceptos que hay que mantener. Para un MVP de 500 productos, tres fuentes y una persona operándolo, continuar extendiendo todas esas rutas haría más difícil terminar y depurar reglas comunes.

La duplicación de selección de precio entre `catalog.ts` y `portfolio-catalog.ts` ya produce diferencias visibles. Esa es una razón concreta para unificar una función de dominio. En cambio, el hecho de que un módulo tenga muchas líneas no justifica dividirlo en veinte archivos sin reducir responsabilidades.

Aplicaría tres simplificaciones: una única lectura pública basada en snapshot; una política compartida de precio/frescura/disponibilidad/cobertura; una única instrucción vigente de reanudación. Dejaría inmóviles las rutas operativas fuera del alcance hasta saber que no tienen consumidores y hasta que CMVP-04 esté demostrado. No eliminaría masivamente trabajo previo ni abstraería diferencias reales entre fuentes.

## 5. Commits, PRs e issues

La cadena OS03/CMVP ya fue integrada. El 21/09 se fusionaron 23 PRs en la ventana revisada. Solo permanece abierto el borrador documental #461. No corresponde volver a planificar la integración como si siguiera pendiente.

Hay commits con scopes y propósitos claros, PRs con límites y rollback, y pruebas junto a implementación. También hay unidades grandes: #475 cambió 94 archivos y más de 6.900 líneas aun excluyendo lockfile; #496 cambió 29 archivos (+1.371/−302); #497, 30 (+1.580/−763). #475 declara una excepción de tamaño. #485 agregó 54.804 líneas de JSON generado, que no deben contarse como complejidad de aplicación.

Se revisaron las submissions de 12 PRs recientes: no hay reviews formales de GitHub en esa muestra. Sus descripciones y el ledger sí mencionan revisiones nativas de Herdr. Eso limita la trazabilidad externa, pero no demuestra ausencia de revisión.

`master` aparece sin protección efectiva y no hay rulesets. Los checks verdes actuales no son requisitos forzosos para fusionar. Configurar checks requeridos resulta útil una vez corregido qué prueban; no hace falta introducir aprobaciones de varias personas en un proyecto individual.

[PR #475](https://github.com/Mateocas1/ofertaSUPER/pull/475). [PR #496](https://github.com/Mateocas1/ofertaSUPER/pull/496). [PR #497](https://github.com/Mateocas1/ofertaSUPER/pull/497). [PR #485](https://github.com/Mateocas1/ofertaSUPER/pull/485). [Estado de master](https://api.github.com/repos/Mateocas1/ofertaSUPER/branches/master). [Rulesets](https://api.github.com/repos/Mateocas1/ofertaSUPER/rulesets).

### El estado documental necesita reconciliación

El roadmap dice T4b no comenzado y lo prescribe como próximo paso. El ledger ya registra CMVP-03 completo y CMVP-04 pendiente. El propio roadmap indica detenerse si ambos difieren. Esto puede provocar que un agente vuelva a inventariar, se bloquee o repita trabajo terminado.

Además, varios PRs intermedios usaron `Closes #405`; el issue terminó cerrado tras #479 aunque conserva criterios operativos históricos sin completar. Su cierre no demuestra lanzamiento. Tampoco hay que imponer automáticamente todos los criterios de una arquitectura operativa antigua al MVP reducido. Para entregas intermedias conviene `Refs`, y reservar `Closes` para el resultado completo.

**Cierre documental:** un estado actual breve con SHA, etapa, evidencia y próximo resultado; roadmap como alcance estable; historial como evidencia fechada. Actualizar los documentos existentes y retirar instrucciones obsoletas evita crear otra capa de documentación.

[Roadmap contradictorio](https://github.com/Mateocas1/ofertaSUPER/blob/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15/docs/consumer-mvp-roadmap.md). [Ledger actual](https://github.com/Mateocas1/ofertaSUPER/blob/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15/odd/tasks/consumer-mvp-reset.md). [Issue #405](https://github.com/Mateocas1/ofertaSUPER/issues/405).

## 6. Plan finito de terminación

Este plan concreta CMVP-04 y CMVP-05; no sustituye el alcance aceptado.

| Orden | Entrega | Criterio de terminado |
|---|---|---|
| 1 | Baseline de verificación y parche de dependencias | Todos los archivos de tests descubiertos; fallos clasificados/resueltos según diseño actual; auditoría de producción revisada; build/typecheck pasan; documentación apunta a CMVP-04 |
| 2 | Observación temporal y snapshot público | Reanudar/repetir no cambia la fecha de origen; artefacto con EAN, nombre, fuente, precio, disponibilidad, URL, fechas y versión; consulta/ficha/canasta leen ese mismo contrato |
| 3 | Recorrido de compra coherente | Cinco productos con cantidades correctas; faltantes nunca completos; no disponible e histórico claramente presentados; resultados después del 24 accesibles; tres fuentes coherentes |
| 4 | Publicación y siguiente actualización | Alias público sirve la versión comprobada; casos fresco/histórico/no disponible/missing verificados en móvil; una actualización en otra ventana conserva semántica y un fallo no vuelve vigentes datos viejos |
| 5 | Piloto CMVP-05 | 5–15 participantes; al menos cinco recorridos completos; registro de búsquedas fallidas, cobertura, uso de canasta y confianza; próxima inversión decidida con esas observaciones |

Las primeras tres unidades son preparación e implementación. La publicación necesita un candidato concreto comprobado; esta auditoría no ejecutó despliegues. El piloto no exige una plataforma de analítica: una observación guiada y una tabla de resultados pueden satisfacer el objetivo inicial.

### Condiciones que debe preservar el snapshot

La fecha de exportación nunca reemplaza la de observación de cada precio. Un artefacto estático válido puede volverse histórico con el paso del tiempo; la presentación debe evaluarlo respecto del momento de lectura, no dejar un `fresh:true` congelado durante días. Si falla el proceso local de actualización, se conserva una versión coherente con etiquetas honestas. La canasta no suma registros que la política vigente declare no elegibles.

Una adquisición local reduce servicios y costes, pero introduce una dependencia operativa concreta: la máquina y el proceso de actualización deben estar disponibles. Antes de prometer actualización diaria, hay que probar ese ciclo y definir quién lo ejecuta. Para el piloto alcanza una operación pequeña y explícita; una automatización extensa puede esperar a que haya utilidad demostrada.

### Qué queda fuera de esta terminación

Se mantienen fuera SEPA, expansión a seis supermercados, búsqueda aproximada, cuentas, checkout, promociones bancarias avanzadas, nuevos sistemas de aprobación, nuevas bases administradas y eliminación completa de los hotspots históricos. PWA, Lighthouse perfecto y una refactorización total no deben convertirse en condiciones adicionales de cierre.

La regla de priorización propuesta es: una tarea entra ahora si corrige un dato engañoso, conecta el recorrido acordado, permite demostrarlo o resuelve un riesgo concreto del despliegue. Las demás se reconsideran después del piloto.

## 7. Reproducción y límites de evidencia

### Enumeración reproducible de tests

El problema está en que el shell elige los archivos. Se recomienda un launcher Node que enumere recursivamente los `.test.ts` y pase cada ruta como argumento, sin expansión del shell. Durante esta revisión se ejecutó el equivalente de:

```text
node --import tsx --conditions=react-server --test --test-concurrency=4 <los 143 archivos enumerados explícitamente>
```

Resultados del run completo: 1.022 tests, 103 suites, 992 pass, 13 fail, 17 skip, aproximadamente 33 segundos. La selección parcial equivalente a npm test dio 111 tests, 17 suites, 99 pass, 0 fail, 12 skip.

Familias con fallos: candidate-audit (CLI IPC), catalog-serving-identity-proof, compose-smoke-contract, portable-redis, postgres-operations, postgres-recovery-r2-contract, production-dependency-gate, public-catalog-runtime y vea-likely-missing-triage (CLI IPC). Las assertions de Compose, build y caché proporcionan ejemplos de diferencias deterministas entre contratos antiguos y código presente; las de autoridad/runtime requieren clasificación específica en el entorno de CI. No se atribuye toda la lista a defectos del producto.

### Reproducciones de lógica

La canasta se comprobó extrayendo las funciones existentes, transpilándolas y ejecutándolas en memoria. La reconciliación se comprobó invocando la función real con un cliente Prisma simulado, fila antigua y reloj controlado. Son pruebas de la lógica exacta del SHA, no pruebas contra datos personales ni una operación productiva.

### Límites

Los conteos de catálogo provienen de artefactos fechados; no se consultó la base local del usuario. El recorrido público se observó por HTTP, sin reclamar una nueva validación móvil. La frescura diaria, la identidad del SHA desplegado y el éxito del piloto permanecen por demostrar. La evidencia vieja conserva valor histórico, pero el candidato final debe tener sus propias comprobaciones.

**Decisión recomendada:** continuar con CMVP-04 sobre esta base, aplicar las correcciones concretas anteriores y pasar al piloto. El proyecto puede cerrarse como MVP sin completar toda su infraestructura histórica.
