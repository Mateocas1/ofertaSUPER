# Current status note - 2026-05-17

The historical PWA/build blocker described below was rechecked by `goal.md` Gate 2 on 2026-05-17. `npm run build` passed with PWA enabled and exit code `0`; the current evidence is `docs/reports/production-readiness/2026-05-17-gate2-build-pwa.md`. Keep the old notes as historical context only.

---
# Release Follow-Up Runbook

## Objetivo

Este documento fija el estado real verificado del proyecto al cierre de la sesion del 2026-03-23 y define los siguientes pasos de forma operativa para futuras sesiones.

No debe usarse para inferir comportamiento no validado.

Si una futura sesion contradice este documento, primero hay que volver a verificar con evidencia en runtime antes de cambiar el diagnostico.

## Regla de trabajo para futuras sesiones

1. No asumir que un gate esta cerrado solo porque el codigo existe.
2. No asumir que un problema local desaparecio si no se re-ejecuta el build o la prueba concreta.
3. No escribir datos en DB para cerrar gates de Fase 3 o Fase 4 sin autorizacion explicita del usuario.
4. No presentar el kill switch `DISABLE_PWA=true` como solucion final del problema PWA.
5. Antes de tocar configuracion sensible, releer estos archivos:
   - `next.config.ts`
   - `README.md`
   - `PLANIFICACION.md`
   - `docs/release-followup-runbook.md`

## Estado verificado al cierre de la sesion 2026-03-23

### Hechos confirmados en runtime

- `DISABLE_PWA=true npm run build` completa correctamente.
- `npm run build` normal falla durante prerender de `/` con PWA activa.
- El detalle de producto `/producto/7790387800197` renderiza comparativa multi-super real.
- El HTML del detalle contiene un bloque JSON-LD con `Product`, `BreadcrumbList` y `Offer`.
- `/manifest.json` responde `200` y sirve manifest valido a nivel superficial.
- `/robots.txt` y `/sitemap.xml` responden correctamente.
- `/api/search` aplica rate limit real y la request 61 devuelve `429`.
- `/api/search?q=coca&limit=8` mostro una primera respuesta lenta y respuestas subsiguientes cacheadas alrededor de 67-69 ms.
- `/ofertas` renderiza bien, pero no habia promociones manuales activas para validar E2E.
- `/canasta` calculo una canasta real de 5 productos; Carrefour y Jumbo quedaron completos en la prueba hecha.
- `cleanup:history -- --dry-run`, `cleanup:staging -- --dry-run` y `metrics:ingestion -- --dry-run` ejecutaron sin error.

### Riesgos reales que siguen abiertos

1. El release blocker principal sigue siendo PWA/build. El kill switch es util para aislar, no es solucion final.
2. El entorno local estaba usando claves de desarrollo de Clerk.
3. Recharts sigue mostrando un warning de tamaño en el navegador integrado; no rompio funcionalidad, pero existe.

## Bloqueador principal: build productivo con PWA activa

### Estado exacto

- Archivo involucrado: `next.config.ts`
- Kill switch actual:
  - `const disablePwa = process.env.DISABLE_PWA === "true";`
  - `disable: process.env.NODE_ENV === "development" || disablePwa`
- Diagnostico vigente: la incompatibilidad probable esta en la integracion con `@ducanh2912/next-pwa` durante build/prerender de Next.js 15.

### Lo que SI esta probado

- Con PWA activa, el build falla.
- Con `DISABLE_PWA=true`, el build pasa.
- Esto acota el problema a la capa PWA o a su interaccion con el runtime de build.

### Lo que NO esta probado

- No esta probado aun el root cause exacto dentro del plugin PWA.
- No esta probado que Clerk sea la causa raiz.
- No esta probado que el problema ocurra solo en la maquina local.

### Protocolo de trabajo para futuras sesiones

1. Reproducir primero el fallo sin tocar codigo:

```powershell
npm run build
```

2. Confirmar que el bypass sigue funcionando:

```powershell
$env:DISABLE_PWA='true'; npm run build; Remove-Item Env:DISABLE_PWA
```

3. Solo despues empezar el aislamiento por capas. Orden sugerido:
   - revisar `next.config.ts`
   - revisar `public/manifest.json`
   - revisar los artefactos service worker generados en `public/`
   - verificar si hay cambios recientes en el wrapper `withPWA`
   - verificar compatibilidad del plugin con la version exacta de Next.js 15 usada en este repo

4. Criterio minimo para considerar resuelto este bloqueador:
   - `npm run build` pasa sin `DISABLE_PWA=true`
   - `npm run start` levanta sin workaround
   - `/manifest.json` sigue respondiendo bien
   - no se rompe navegacion publica basica: `/`, `/producto/[ean]`, `/ofertas`, `/canasta`

5. Criterio para NO marcarlo resuelto:
   - solo funciona con `DISABLE_PWA=true`
   - el build pasa pero desaparece el manifest, service worker o ruta offline sin decision explicita del usuario
   - se degrada el sitio para esconder el error en lugar de arreglar la causa

## Riesgo operativo: Clerk en modo desarrollo

### Estado exacto

Durante la validacion en navegador se vio el warning de Clerk indicando que el entorno cargaba development keys.

### Impacto

- No bloquea pruebas locales.
- Si bloquea considerar el entorno como listo para produccion.

### Protocolo

1. No cambiar esto a ciegas dentro del repo.
2. Verificar primero si el problema es solo del `.env.local` actual o tambien del entorno de deploy.
3. Cerrar este riesgo solo cuando:
   - el entorno a validar use `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` y `CLERK_SECRET_KEY` de produccion
   - el warning deje de aparecer en runtime

## Riesgo tecnico menor: warning de Recharts

### Estado exacto

En el navegador integrado aparecio este warning en consola al visitar el detalle de producto:

- `The width(-1) and height(-1) of chart should be greater than 0`

### Interpretacion vigente

- El chart no quedo roto funcionalmente.
- El warning existe y no debe ignorarse si se trabaja en polish final.
- No es el release blocker principal mientras PWA/build siga abierto.

### Protocolo

1. No mezclar este fix con el fix del build PWA.
2. Si se trabaja este warning, releer:
   - `src/components/lazy-price-chart.tsx`
   - `src/components/price-chart.tsx`
3. Criterio de cierre:
   - el warning deja de aparecer en el navegador integrado
   - el grafico sigue renderizando con datos reales

## Paso pendiente con permiso explicito: promo temporal en DB

### Objetivo

Autorizar una promo temporal en DB para cerrar el gate E2E de Fase 3 y luego borrarla.

### Estado actual

- Este gate NO esta cerrado.
- No habia promociones manuales activas con las que validar el flujo.
- El repo ya tiene UI y API de admin para crear, editar y borrar promociones.

### Archivos relevantes

- `src/app/admin/promociones/page.tsx`
- `src/app/admin/promociones/nueva/page.tsx`
- `src/app/api/admin/promotions/route.ts`
- `src/app/api/admin/promotions/[id]/route.ts`
- `src/lib/admin/promotions.ts`

### Condicion obligatoria antes de ejecutar

No hacer esta prueba sin permiso explicito del usuario, porque escribe datos reales en la base.

### Flujo exacto a ejecutar cuando haya permiso

1. Crear una promo manual temporal y facil de identificar.
2. Verificar que aparezca en `/ofertas`.
3. Verificar que aparezca en el producto o supermercado esperable segun su configuracion.
4. Borrarla al final de la prueba.
5. Registrar evidencia de cada paso.

### Evidencia minima a capturar

- payload exacto creado
- id de promo creada
- prueba visual o API de que aparece en `/ofertas`
- prueba visual o API de que aparece en la pagina esperada
- confirmacion de borrado

### Criterio de cierre del gate

El gate solo queda cerrado si se valida el flujo completo:

- crear
- ver en admin o API
- ver en `/ofertas`
- ver aplicada donde corresponde
- eliminar

## Paso pendiente con permiso explicito: mutacion temporal de precio para validar ISR

### Objetivo

Autorizar una mutacion temporal de precio para validar ISR de forma real.

### Estado actual

- Este gate NO esta cerrado.
- La pagina de producto usa `revalidate = 21600` en rutas publicas relevantes.
- No se hizo mutacion real de precio en DB en esta sesion.

### Archivos relevantes

- `src/app/producto/[ean]/page.tsx`
- `src/app/ofertas/page.tsx`
- `src/app/buscar/page.tsx`
- `src/app/categoria/[slug]/page.tsx`

### Condicion obligatoria antes de ejecutar

No hacer esta prueba sin permiso explicito del usuario, porque modifica datos reales.

### Flujo exacto a ejecutar cuando haya permiso

1. Elegir un EAN con detalle publico estable.
2. Capturar el precio visible antes del cambio.
3. Mutar temporalmente el precio en DB de forma reversible.
4. Observar si la pagina refleja el cambio dentro de la ventana esperada o mediante la estrategia de revalidacion disponible.
5. Restaurar el precio original.
6. Registrar timestamps reales.

### Evidencia minima a capturar

- EAN elegido
- precio original
- precio temporal de prueba
- hora exacta del cambio
- hora exacta en que el cambio se vuelve visible
- hora exacta de restauracion

### Criterio de cierre del gate

Solo puede cerrarse con evidencia temporal real. No alcanza con decir que la ruta exporta `revalidate = 21600`.

## Siguiente paso razonable

1. Autorizar una promo temporal en DB para cerrar el gate E2E de Fase 3 y luego borrarla.
2. Autorizar una mutacion temporal de precio para validar ISR de forma real.
3. Seguir ahora con la causa raiz del fallo de build con PWA activa.

## Orden recomendado de ejecucion en futuras sesiones

### Opcion A: priorizar release blocker tecnico

1. Resolver build con PWA activa.
2. Re-ejecutar build y smoke test.
3. Luego cerrar promo E2E.
4. Luego cerrar ISR.

### Opcion B: priorizar cierre de gates funcionales con permiso del usuario

1. Cerrar promo E2E.
2. Cerrar ISR con mutacion temporal.
3. Luego volver al fix raiz de PWA/build.

### Recomendacion vigente

Priorizar `PWA/build` primero porque sigue siendo el release blocker principal.

## Checklist rapido para retomar en otra sesion

- Releer este documento completo.
- Reproducir `npm run build` sin workaround.
- Confirmar que el fallo sigue acotado a PWA con `DISABLE_PWA=true`.
- No tocar DB sin permiso del usuario.
- Si el usuario autoriza escrituras, cerrar primero promo E2E o ISR con evidencia completa.
- No dar por resuelto ningun gate sin prueba real en runtime.