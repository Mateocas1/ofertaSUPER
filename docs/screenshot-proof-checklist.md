# Screenshot proof checklist

Este checklist define qué capturar para usar `ofertasSUPER` como evidencia recruiter-facing sin vender datos demo como datos reales.

## Regla principal

No usar screenshots de rutas dependientes de DB como “evidencia real” hasta que Supabase conecte y `ingest --dry-run` o datos existentes estén verificados. La screenshot actual de home fallback sirve para demostrar resiliencia de UI, no ingesta productiva.

## Screenshot actual disponible

| Ruta | Archivo | Uso permitido |
|---|---|---|
| `/` con Supabase no disponible | `docs/screenshots/home-demo-fallback-2026-05-14.png` | Demo fallback/resiliencia, no datos scrapeados reales |
| `/buscar?q=leche` con Supabase activo | `docs/screenshots/search-leche-real-2026-05-15.png` | Evidencia real de busqueda/listado |
| `/producto/7790387800197` con Supabase activo | `docs/screenshots/product-7790387800197-comparison-2026-05-15.png` | Evidencia real de detalle/comparativa |
| `/canasta` con Supabase activo | `docs/screenshots/cart-real-products-2026-05-15.png` | Evidencia real de canasta local con producto, precios y totales por supermercado |

## Capturas pendientes con datos reales

| Prioridad | Ruta | Evidencia que debe mostrar | Condición previa |
|---|---|---|---|
| P1 | `/buscar?q=leche` | Resultados reales de supermercado, precios y fuente | Hecho |
| P1 | `/producto/[ean]` | Comparativa por supermercado, precio vigente, historial si existe | Hecho para EAN `7790387800197` |
| P1 | `/canasta` | Canasta con producto real y totales por supermercado | Hecho para EAN `7790387800197`; la API `/api/products/[ean]` responde 200 tras fallback Redis/rate-limit |
| P2 | `/ofertas` | Promos o descuentos reales/manuales | Datos de promos presentes |
| P2 | `/admin/promociones` | CRUD/admin protegido | Clerk admin validado en entorno seguro |

## Criterio de aceptación

- [ ] La ruta responde 200.
- [ ] La captura no depende del fallback demo.
- [ ] Se ve al menos una fuente/supermercado real.
- [ ] El archivo queda en `docs/screenshots/`.
- [ ] El README o readiness doc aclara si la captura es demo, real o admin.
- [ ] No hay datos sensibles visibles.

## Nombres sugeridos

- `search-leche-real-YYYY-MM-DD.png`
- `product-<ean>-comparison-YYYY-MM-DD.png`
- `cart-real-products-YYYY-MM-DD.png`
- `offers-real-YYYY-MM-DD.png`
- `admin-promotions-safe-YYYY-MM-DD.png`

