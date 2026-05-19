# Goal 1 - Auditoría técnica integral report-only de ofertasSUPER

> Uso recomendado: CLI con `effort=xhigh`. No usar para publicar LinkedIn ni tocar plataformas externas.

```text
/goal Auditar ofertasSUPER en modo report-only para entender con evidencia qué tan sólido está el proyecto, qué está a medias, qué deuda técnica existe y qué mejoras maximizan las chances laborales sin inflar claims.

Contexto:
- Proyecto principal: C:\Users\picala\Documents\ofertasSUPER.
- Repo remoto esperado: git@github.com:Mateocas1/ofertaSUPER.git.
- Rama esperada: master.
- Estado laboral actual: portfolio/laboral-ready, NO production-ready.
- Demo pública actual: https://ofertas-super.vercel.app.
- Objetivo real de negocio/carrera: aumentar al máximo las chances de conseguir trabajo en IT/software/developer usando ofertasSUPER como evidencia técnica defendible.
- No tocar ofertasas salvo referencia histórica explícita.
- No tocar test-kimi, portfolio/CV/LinkedIn salvo lectura de contexto si hace falta.

Objetivo:
Crear una auditoría técnica profesional, honesta y accionable de ofertasSUPER, report-only por defecto, que separe:
1. Qué está sólido y defendible.
2. Qué está a medias o incompleto.
3. Qué es deuda técnica real.
4. Qué puede romper en producción.
5. Qué conviene mejorar primero para subir empleabilidad.
6. Qué mejoras generan mejor material para README, case study, LinkedIn y entrevistas.

Contrato estricto:
- Report-only por defecto: no modificar código productivo salvo que el usuario apruebe una corrección puntual.
- No correr build local.
- No ejecutar ingesta masiva, writes reales, schedules, deploys ni cambios de dashboards externos.
- No imprimir secretos; solo presencia/ausencia, nombres de variables, hosts o puertos si son necesarios.
- No inventar claims production-ready.
- No proponer refactors grandes sin evidencia de payoff laboral/técnico.
- No mezclar esta auditoría con publicaciones, networking o aplicaciones laborales.
- Si aparece diff inesperado, parar, inspeccionar y reportar antes de continuar.
- Guardar en Engram descubrimientos no obvios, decisiones y riesgos.

Arquitectura de auditoría:
Trabajar por capas, de afuera hacia adentro:
1. Producto y rutas públicas.
2. API routes y contratos de entrada/salida.
3. Dominio/catálogo/canasta/promociones.
4. Prisma/Supabase/RLS/migrations/queries.
5. Ingesta VTEX/pipeline/scripts/schedules.
6. Auth/admin/security boundaries.
7. Performance/cache/rate-limit/complexidad.
8. Tests/CI/observabilidad/ops.
9. Limpieza repo/ruido/archivos generados/dead code.
10. Career proof: qué hallazgos se pueden convertir en evidencia pública.

Áreas obligatorias:
- Clean code: responsabilidades, nombres, funciones largas, duplicación, módulos con demasiadas razones para cambiar.
- TypeScript: `any`, casts inseguros, tipos inferidos débiles, contratos API, Zod schemas, nullability.
- Imports/exports: imports muertos, exports colgados, archivos no referenciados, rutas obsoletas.
- Archivos basura: temporales, screenshots duplicados, logs viejos, generated noise, docs contradictorios.
- Tests: cobertura real vs falsa seguridad; unit/integration/smoke/E2E acotado; tests frágiles o faltantes.
- Edge cases: DB caída, Redis caído, VTEX caído, query vacía, producto sin EAN, duplicados, precios nulos, canasta vacía, auth ausente.
- Race conditions: ingesta concurrente, updates de precios, promociones, schedules, writes duplicados, idempotencia.
- Performance: N+1, scans repetidos, O(n*m), loops evitables, cache misses, payloads grandes.
- Seguridad: RLS, grants, admin fail-closed, secrets, rate-limit, SSR/API boundaries, input validation.
- Producción real: secrets, schedules, monitoreo, backups, restore drill, deploy, smoke, observabilidad.

Comandos permitidos:
- `git status --short --branch`
- `git log --oneline -10`
- `git ls-files`
- `rg` / `Select-String` para búsqueda estática.
- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npx prisma validate --schema prisma/schema.prisma`
- `npx prisma migrate status --schema prisma/schema.prisma`
- Smoke HTTP público acotado contra Vercel si no implica cambios.

Comandos prohibidos salvo aprobación explícita:
- `npm run build`
- ingesta no dry-run o masiva
- cambios SQL reales
- deploys
- cambios en Vercel/Supabase/GitHub Actions dashboards
- publicación LinkedIn/GitHub externa

Gates:

Gate 0 - Identidad y baseline:
- Confirmar repo correcto, branch, remote, git status limpio o explicar diffs.
- Confirmar último commit local/remoto.
- Leer README, docs/handoff y última auditoría final.
- Estado requerido para avanzar: GREEN o STOPPED si hay diff ajeno.

Gate 1 - Mapa del sistema:
- Documentar rutas públicas, APIs, scripts, workflows, Prisma models, servicios clave.
- Output: inventario en el reporte.
- No evaluar todavía; primero mapear.

Gate 2 - Hallazgos técnicos:
- Revisar cada área obligatoria.
- Cada hallazgo debe tener: evidencia, impacto, severidad, recomendación, tests necesarios, valor laboral.
- Prohibido reportar “sensaciones” sin archivo/línea/comando.

Gate 3 - Priorización:
- Clasificar P0/P1/P2.
- P0: riesgo que rompe demo, seguridad básica, datos, reputación o tests fundamentales.
- P1: mejora fuerte para calidad/entrevista/performance.
- P2: nice-to-have o polish.

Gate 4 - Roadmap de hardening:
- Convertir hallazgos en slices implementables para Goal 2.
- Cada slice debe tener objetivo, archivos probables, test gate, riesgo, commit sugerido.

Gate 5 - Career proof extraction:
- Identificar 3-6 historias técnicas publicables.
- Para cada historia: problema, decisión, evidencia, aprendizaje, claim seguro.
- No escribir posts finales aún; solo extraer material.

Output obligatorio:
- `docs/reports/engineering-audit/YYYY-MM-DD-ofertassuper-technical-audit.md`
- `docs/reports/engineering-audit/YYYY-MM-DD-ofertassuper-backlog.md`
- `docs/reports/engineering-audit/YYYY-MM-DD-ofertassuper-career-proof-opportunities.md`
- Actualizar `docs/handoff.md` solo si el estado del repo cambia o aparecen riesgos importantes.

Criterio de éxito:
- Auditoría completa y honesta.
- No cambios productivos accidentales.
- Tests mínimos ejecutados y registrados.
- Backlog P0/P1/P2 claro.
- Siguiente Goal 2 puede ejecutarse sin redescubrir todo.
- El reporte ayuda a conseguir trabajo porque muestra criterio de ingeniería, no solo lista de bugs.
```
