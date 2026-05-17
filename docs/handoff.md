# ofertasSUPER handoff

Última actualización: 2026-05-16

## Estado actual

- Primera slice visual de home implementada contra `docs/design/canasta-inteligente-ui-spec.md`.
- Preview aprobada usada como referencia: `docs/design/canasta-inteligente-preview-2026-05-16.png`.
- No se avanzó a detalle de producto ni canasta profunda.
- Quedan cambios previos sin ordenar en el working tree, principalmente documentación, rutas, libs, scripts, Prisma, assets y tests heredados.

## Commits de esta slice

- `c76e545 refactor(ui): share button variants`
- `43e7b9f feat(layout): add canasta visual foundation`
- `8f886cd feat(home): implement canasta inteligente slice`

## Verificación ejecutada

- `npm test` — 16/16 tests pasan.
- `npm run typecheck` — OK.
- `npm run lint` — OK.
- QA visual con dev server local `http://127.0.0.1:3015/` y Edge headless:
  - desktop screenshot: `C:\Users\picala\AppData\Local\Temp\ofertas-super-home-desktop-1536x960.png`
  - mobile screenshot: `C:\Users\picala\AppData\Local\Temp\ofertas-super-home-mobile-390x900.png`

## Comparación visual

- Header: respeta marca, nav `Inicio`, `Buscar`, `Ofertas`, `Canasta` y acción `Ver canasta`.
- Hero: mantiene búsqueda primero, H1 aprobado, CTA y chips rápidos.
- Canasta inteligente: queda como firma visual con productos, ranking, cobertura y estado humano.
- Resultados: usa filas de producto, no cards ecommerce genéricas.
- Mercado vivo: se mantiene liviano y secundario.
- Diferencia intencional: thumbnails de producto son miniaturas vectoriales code-native, no packshots reales.

## Riesgos / pendientes

- `/buscar?q=leche` respondió 500 en QA local por `PrismaClientInitializationError`: no se pudo alcanzar `aws-1-sa-east-1.pooler.supabase.com:6543`.
- Esto no bloqueó el render de home (`/` respondió 200), pero sí bloquea considerar cerrado el flujo interactivo completo del buscador.
- Revisar Supabase/conectividad o aplicar fail-open en la página de búsqueda antes de declarar el flujo de búsqueda completo.
- Seguir separando el working tree restante en commits por unidad sin mezclarlo con esta slice visual.
