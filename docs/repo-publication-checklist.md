# ofertasSUPER — repo publication checklist

Este checklist existe para que el repo pueda mostrarse públicamente sin mezclar evidencia real con ruido de working tree.

## Estado actual

No publicar ni linkear el repo como evidencia principal hasta cerrar esta higiene mínima:

- [x] Revisar el working tree completo con `git status --short`.
- [ ] Separar cambios propios del proyecto vs. artefactos generados.
- [x] Confirmar que `temp-init/` ya no existe en el working tree; quedan sus bajas en Git y hay que commitearlas o revertirlas deliberadamente.
- [x] Decidir si los service workers en `public/*.js` son artefactos generados o assets versionados: se tratan como generados y se ignoran en `.gitignore`.
- [x] Quitar `jaja.txt`: contenía una nota suelta de runbook y no debía publicarse como evidencia.
- [ ] Commit claro con mensaje convencional.
- [ ] README final sin claims de producción no verificados.
- [x] `.env.example` safe agregado con placeholders y sin secretos reales.
- [x] Admin fail-closed por allowlist `ADMIN_EMAILS` o metadata Clerk `role=admin`, aplicado a paginas y APIs `/api/admin`.
- [ ] Screenshots en `docs/screenshots/` actualizados.
- [x] Crear plan de commits/review para partir el working tree grande: `docs/repo-review-plan.md`.
- [x] Crear checklist de screenshots reales vs fallback: `docs/screenshot-proof-checklist.md`.

Snapshot de ruido actual:

- `jaja.txt` fue eliminado porque era nota temporal, no artefacto de producto.
- `public/sw.js`, `public/workbox-*.js`, `public/fallback-*.js` y `public/swe-worker-*.js` se tratan como artefactos PWA/generados y quedaron ignorados.
- `.github/`, `prisma/`, `scripts/`, `src/app/api/`, rutas públicas/admin y `tests/` son cambios sustantivos del proyecto; separarlos en commits revisables.

## Cambios recientes que sí son defendibles

| Área | Archivos |
|---|---|
| VTEX/SHA256 | `src/lib/vtex/client.ts`, `src/lib/vtex/encode.ts`, `scripts/probe-vtex.ts`, `tests/vtex.test.ts` |
| Demo fallback | `src/lib/safe-data.ts`, `src/lib/demo-data.ts`, `src/app/page.tsx`, `docs/screenshots/home-demo-fallback-2026-05-14.png` |
| Calidad | `package.json`, `eslint.config.mjs`, `tests/vtex.test.ts` |
| Docs | `README.md`, `docs/production-readiness-vtex.md`, `docs/repo-publication-checklist.md` |
| DB blocker | `docs/supabase-connection-runbook.md` |
| Review plan | `docs/repo-review-plan.md` |
| Screenshot proof | `docs/screenshot-proof-checklist.md` |

## Claims permitidos si se publica hoy

- “Tiene pipeline VTEX/SHA256 server-side implementado a nivel código.”
- “El probe VTEX para todas las fuentes configuradas devolvió `isHealthy=true`, `hashValid=true` y 3 productos por fuente con red externa.”
- “Tiene tests iniciales para request VTEX y normalización.”
- “Tiene lint/typecheck limpios.”
- “La home tiene fallback demo representativo para no romper demo si Supabase está caído.”

## Claims prohibidos hoy

- “Producción lista.”
- “Scraper/ingesta DB verificados en vivo.”
- “Deploy cerrado.”
- “Cobertura completa.”
- “Repo limpio/listo para review pública.”
