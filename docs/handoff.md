# ofertasSUPER handoff

Última actualización: 2026-05-16

## Estado actual

- Primera slice visual de home implementada contra `docs/design/canasta-inteligente-ui-spec.md`.
- Preview aprobada usada como referencia: `docs/design/canasta-inteligente-preview-2026-05-16.png`.
- No se avanzó a detalle de producto ni canasta profunda.
- El buscador principal ya no cae en 500 local cuando Supabase/Prisma no está alcanzable: `/buscar` y `/api/search` degradan a datos demo acotados.
- Quedan cambios previos sin ordenar en el working tree, principalmente documentación, rutas profundas, admin, ingesta, scripts, assets y tests heredados.

## Commits de esta etapa

- `c76e545 refactor(ui): share button variants`
- `43e7b9f feat(layout): add canasta visual foundation`
- `8f886cd feat(home): implement canasta inteligente slice`
- `7f56ffd feat(db): add catalog schema foundation`
- `c668ccc feat(promotions): add price signal helpers`
- `194d723 feat(vtex): add supermarket category taxonomy`
- `223df22 feat(catalog): add product comparison queries`
- `347f5c6 feat(catalog): add fail-open demo fallbacks`
- `e5c75a9 feat(api): add fail-open public helpers`
- `06ee3c5 feat(canasta): add persisted item controls`
- `fe38d66 feat(search): add product result components`
- `b5855a4 feat(search): add fail-open search route`
- `b58c1d1 feat(vtex): add request encoding and normalization`
- `a87824c feat(admin): add access policy guard`
- `a85dd52 feat(pwa): add app manifest assets`
- `bb4e5cf docs(repo): add publication readiness checks`
- `1f444b3 docs(ops): add release follow-up runbook`
- `c21eed1 docs(readme): describe current project scope honestly`
- `5c38feb feat(vtex): add live probe client`
- `7a64389 feat(ingestion): add source adapter foundation`
- `8da15f3 feat(ingestion): add vtex scraper scripts`
- `020a399 feat(ingestion): add pipeline validation stages`
- `b0adbad feat(ingestion): add reconcile pipeline`
- `456c19b feat(ingestion): add ingest pipeline cli`
- `5ca15d3 feat(ingestion): add metrics and cleanup scripts`
- `bac3ef5 ci(ingestion): add scheduled pipeline workflows`
- `1f80108 feat(api): add public catalog routes`
- `54bbd13 feat(pwa): add offline fallback page`
- `84a4a72 feat(product): add comparison detail page`
- `f547939 feat(catalog): add category and offers pages`
- `80322e4 feat(canasta): add basket comparison page`
- `eab56b9 feat(admin): add protected dashboard shell`
- `e1279a5 feat(admin): add promotions service`
- `83380f5 feat(admin): add promotions api routes`
- `9438363 feat(admin): add promotions manager UI`
- `c463084 feat(admin): add ingestion service api`
- `0880600 feat(admin): add ingestion dashboard`
- `1b4c605 feat(seo): add robots and sitemap routes`
- `b93078a docs(ingestion): add fase1 telemetry guide`
- `ceafc49 docs(ingestion): add planning prompts`
- `ef56541 docs(ingestion): add fase1 telemetry evidence`
- `392aef4 docs(evidence): add runtime screenshots`
- `1c8b101 docs(plan): update implementation checkpoint`

## Verificación ejecutada

- `npm test` — 21/21 tests pasan.
- `npm run typecheck` — OK.
- `npm run lint` — OK.
- QA visual home con dev server local y Edge headless:
  - desktop screenshot: `C:\Users\picala\AppData\Local\Temp\ofertas-super-home-desktop-1536x960.png`
  - mobile screenshot: `C:\Users\picala\AppData\Local\Temp\ofertas-super-home-mobile-390x900.png`
- QA búsqueda con dev server local `http://127.0.0.1:3029/`:
  - `/` respondió 200.
  - `/buscar?q=leche` respondió 200, renderizó `Leche entera larga vida 1L` y no incluyó `PrismaClientInitializationError`.
  - `/api/search?q=yerba&limit=1` respondió 200 con `Yerba mate suave 1kg` y no incluyó error Prisma.
  - screenshot: `C:\Users\picala\AppData\Local\Temp\ofertas-super-search-leche-1365x900.png`

## Comparación visual

- Header: respeta marca, nav `Inicio`, `Buscar`, `Ofertas`, `Canasta` y acción `Ver canasta`.
- Hero: mantiene búsqueda primero, H1 aprobado, CTA y chips rápidos.
- Canasta inteligente: queda como firma visual con productos, ranking, cobertura y estado humano.
- Resultados: usa filas/cards de producto funcionales, sin virar a ecommerce genérico.
- Mercado vivo: se mantiene liviano y secundario.
- Diferencia intencional: thumbnails de producto son miniaturas code-native o placeholder `Sin foto`, no packshots reales.

## Riesgos / pendientes

- Supabase/Prisma sigue tratado como dependencia externa: en local puede no estar alcanzable, por eso el catálogo público ahora falla abierto con fallback demo.
- Falta ordenar el resto del working tree en commits separados: admin, producto profundo, canasta profunda, categorías/ofertas, ingesta, scripts, docs operativos, assets PWA y tests heredados.
- No se corrió build por restricción explícita del objetivo.
