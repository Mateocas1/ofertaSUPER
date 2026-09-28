# Cierre v1 — 2026-09-28

Verificación de producción: https://ofertas-super.vercel.app (deploy del master con el snapshot de la corrida del 28/09, 07:40 UTC). `/buscar?q=leche`, `/api/search?q=leche` (dataSource: database), `/producto/[ean]`, `/canasta` y `/ofertas` responden 200 con datos reales.

## Qué quedó en v1

- **Búsqueda** con ranking (EAN exacto, nombre que empieza con el término, palabra completa sin "de" previo) y límite de sugerencias.
- **Ficha de producto** con precio por súper, historial de precios por día, tachado de precio de lista con porcentaje, y etiquetas de promos simples de Carrefour.
- **Carrito** con mezcla automática (cada producto al súper más barato elegible), total y ahorro frente a la mejor canasta en un solo súper, cambio manual de súper por producto, cantidades y faltantes honestos (nunca "completa" si falta algo).
- **APIs públicas** (`/api/search`, `/api/products`, `/api/products/[ean]`, `/history`, `/batch`) leyendo el snapshot commiteado, con rate limit estricto en las rutas públicas.
- **Refresh diario**: 36 lotes + relectura por EAN de las ofertas no cubiertas, promos de Carrefour capturadas en staging, snapshot versionado commiteado y publicado por PR del cron.

## Gates

| Gate | Contenido | PRs |
|---|---|---|
| 0 | Plan versionado y mesa limpia | #505 |
| 1 | Suite confiable en master | #500, #501 |
| 2 | Datos verdaderos y dependencias seguras | #506, #507, #508 |
| 3a/3b | Snapshot, lector, adaptadores, APIs y páginas | #509, #510, #511, #513, #514, #515 |
| 3c | Producción sirve el snapshot | #516 |
| 4a/4c | Precio tachado y promos simples de Carrefour | #517, #518, #525, #526 |
| 5 | Carrito mezclable y correcto | #519, #520, #521 |
| 6 | Refresh diario + top-up + cron | #522, #523, #527, #529, #530, #531, #533–#537 |
| 7 | Cierre | #539 |

**Gate 6: CUMPLIDO salvo el segundo refresh en día distinto, que corre el cron del 29/09 a las 10:00 UTC** (primer refresh: 36/36 lotes, 100% de ofertas <24 h en los tres súpers, snapshot publicado por la corrida desatendida).

## Limitaciones conocidas

- Solo Carrefour expone promos simples por producto; **Disco y Jumbo no traen etiquetas** (sus teasers están vacíos y sus campañas viven en clusterHighlights, no por producto).
- **Promos bancarias y de fidelidad fuera de v1**: el parser las ignora a propósito ("Tarjeta Carrefour 15%", "Mi CRF").
- El **refresh depende de que esta máquina esté prendida** y del contenedor postgres del bootstrap local; si no corre, el sitio sigue sirviendo el último snapshot commiteado.
- El **historial de precios arranca el 20/09** (primera adquisición del catálogo real); crece con cada refresh diario.
- El top-up cubre con lecturas por EAN lo que las búsquedas del día no alcanzaron (verificado: 100% <24 h con 327 lecturas, 0 fallidas).

## Qué quedó fuera de v1

- El piloto con usuarios y el crecimiento de catálogo/súpers.
- `direct-refresh*`, las capas de gobernanza (`catalog-authority`, `production-readiness*`) y el subsistema de publicación: **desconectados de la lectura pública y sin borrar**; su limpieza es posterior a v1.
