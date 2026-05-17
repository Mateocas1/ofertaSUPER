# /goal — ofertasSUPER production/portfolio readiness stage-gated

/goal Llevar ofertasSUPER lo más cerca posible de nivel producción y portfolio/GitHub profesional mediante fases estrictas, evidencia fresca y gates de aprobación. No avanzar por intuición: cada fase debe cerrarse con comandos, screenshots/logs o documentación verificable. Si una fase no queda verde o no recibe una aprobación explícita para diferirla, detenerse y reportar el bloqueo.

## Confianza y alcance

Este goal no promete que la app ya esté production-ready. Promete una estrategia de ejecución que impide fingir readiness.

La estrategia solo puede considerarse exitosa si al final cada fase queda en uno de estos estados:

- `GREEN`: verificada con evidencia fresca del run actual.
- `BLOCKED_APPROVED`: bloqueada por dependencia externa o permiso faltante, documentada con evidencia y aprobada explícitamente por el usuario para diferirse.
- `STOPPED`: bloqueo no aprobado; no se avanza a fases posteriores.

No usar evidencia vieja como cierre. Los documentos previos sirven como contexto, no como prueba actual.

## Contexto actual

- Repo principal: `C:\Users\picala\Documents\ofertasSUPER`.
- No tocar `ofertasas`, `test-kimi`, portfolio/CV/LinkedIn salvo pedido explícito.
- Home visual slice ya está cerrada contra:
  - `docs/design/canasta-inteligente-ui-spec.md`
  - `docs/design/canasta-inteligente-preview-2026-05-16.png`
- Último checkpoint: `662093e docs(readiness): add continuity checkpoint evidence`.
- Continuity readiness actual:
  - `npm test` 21/21 OK.
  - `npm run typecheck` OK.
  - `npm run lint` OK.
  - Smoke público básico OK.
  - Prisma schema válido.
  - VTEX probe y dry-run controlado OK.
- Bloqueos conocidos:
  - `npx prisma migrate status --schema prisma/schema.prisma` falla con P1001 en host directo Supabase.
  - Build/PWA no está cerrado.
  - GitHub secrets, Clerk producción, active ingestion, multi-source ingestion y E2E profundo siguen pendientes.

## Principio rector

Trabajar por fases estrictas. Una fase solo se considera cerrada si:

1. El objetivo de la fase está cubierto por archivos/comandos/evidencia concreta del run actual.
2. Los tests relevantes pasan después de cualquier cambio.
3. El working tree queda limpio o con commit convencional de la unidad cerrada.
4. `docs/handoff.md` y/o runbook correspondiente queda actualizado.
5. La auditoría prompt-to-artifact mapea pedido → archivo/commit → verificación → pendiente.
6. Los riesgos que no se cierren quedan explícitamente marcados como `BLOCKED_APPROVED` o `STOPPED`.

Si cualquiera de esos puntos falla, NO pasar a la fase siguiente.

## Contratos estrictos

- No inventar claims production-ready/deploy-ready.
- No esconder fallos con wording optimista.
- No tocar otros proyectos.
- No rediseñar UI salvo que una prueba demuestre una regresión bloqueante.
- No correr ingesta activa, mutaciones de precio, promociones temporales ni escrituras reales de DB sin aprobación explícita del usuario.
- No correr E2E amplio/paralelo que pueda romper la máquina; usar pruebas acotadas, seriales y seguras.
- Commits convencionales, por work-unit, sin Co-Authored-By ni atribución AI.
- Si se cambia lógica: TDD obligatorio, test fallando primero cuando sea viable.
- Si se usa agente/subagente: scope claro, archivos asignados, no pisar cambios de otros, y el agente principal debe revisar diff + verificar localmente.
- Si un comando puede exponer secretos, redireccionar/sanitizar salida o no ejecutarlo.
- Si una acción requiere dashboard externo, credenciales reales o aprobación humana, parar y pedir una única aprobación concreta.

## Aprobaciones obligatorias antes de actuar

Pedir aprobación explícita antes de:

- usar `INGESTION_V2=active`;
- correr ingesta no dry-run;
- correr ingesta multi-source;
- crear promociones temporales;
- mutar precios o datos reales;
- cambiar secrets, dashboards, Supabase, Clerk, Upstash, Vercel o GitHub settings;
- borrar/desactivar PWA como solución final;
- correr Playwright/E2E amplio o paralelo;
- instalar dependencias nuevas;
- publicar/deployar/pushear a remoto.

## Ubicación de evidencia

Guardar evidencia nueva en paths versionables y claros:

- `docs/reports/production-readiness/<date>-<gate>.json|md`
- `docs/screenshots/<date>-<flow>.png`
- `docs/handoff.md`
- runbooks específicos bajo `docs/`

No dejar evidencia final solo en `%TEMP%`.

## Gate 0 — Seguridad de workspace

Objetivo: confirmar que se puede trabajar sin pisar nada.

Verificar:

- `git rev-parse --show-toplevel`
- `git status --short`
- rama actual y últimos commits.
- procesos dev/node colgados de sesiones previas.
- `.env` y `.env.local` ignorados, sin imprimir secretos.
- que `goal.md` sea tratado como input esperado si existe sin commit.

Cierre requerido:

- Repo correcto.
- Sin cambios inesperados.
- Si existe diff ajeno: detenerse, inspeccionar y reportar antes de tocar archivos.

## Fase 1 — Supabase / Prisma / migrations readiness

Objetivo: cerrar el gate DB directo/admin antes de hablar de producción.

Verificar:

- `prisma/schema.prisma`
- `prisma/migrations/**`
- `prisma/seed.ts`
- `.env.example` contra uso real de env vars.
- `npx prisma validate --schema prisma/schema.prisma`
- `npx prisma migrate status --schema prisma/schema.prisma`
- conectividad directa Supabase y pooler por separado.

Si `migrate status` falla:

- No parchear a ciegas.
- Determinar si el problema es DNS, project ref, direct URL, password, Supabase pausado o string viejo.
- Documentar causa probable con evidencia.
- No pasar a Fase 2 salvo aprobación explícita del usuario para marcar esta fase como `BLOCKED_APPROVED`.

Cierre requerido:

- Prisma validate OK.
- Migration status OK, o bloqueo documentado y aprobado por usuario como pendiente explícito.
- Runbook actualizado.

## Fase 2 — Build / PWA blocker

Objetivo: cerrar el blocker técnico principal de build.

Verificar en orden:

1. `npm run build`
2. Si falla, capturar error completo en archivo de evidencia.
3. Confirmar si `DISABLE_PWA=true npm run build` pasa.
4. Aislar causa raíz en `next.config.ts`, PWA plugin, manifest/offline route, service worker o compatibilidad Next/PWA.

Reglas:

- No aceptar `DISABLE_PWA=true` como solución final sin decisión explícita.
- No borrar PWA para esconder el problema.
- No cambiar dependencias sin aprobación explícita.
- Si se cambia config o código: test/lint/typecheck/build deben pasar.

Cierre requerido:

- `npm run build` pasa sin workaround, o bloqueo documentado con causa raíz y decisión explícita.
- `npm test`, `npm run typecheck`, `npm run lint` pasan después del cambio.
- Smoke público acotado después del build si aplica.

## Fase 3 — Env / deploy / secrets readiness

Objetivo: dejar claro qué falta para deploy real y GitHub Actions.

Verificar:

- `.env.example` completo y honesto.
- Secrets requeridos para Vercel/GitHub/Supabase/Clerk/Upstash/VTEX.
- GitHub Actions existentes:
  - `.github/workflows/*.yml`
- No hay secretos trackeados.
- Clerk production keys no se simulan.

Comandos seguros sugeridos:

- `git ls-files .env .env.local .env.example`
- `git check-ignore -v .env .env.local`
- búsqueda de patrones de secretos solo sobre archivos trackeados y sin imprimir valores completos.

Cierre requerido:

- Checklist de secrets por ambiente.
- Qué está verificado localmente vs qué requiere dashboard externo.
- Docs actualizadas sin exponer valores.

## Fase 4 — Ingesta controlada real

Objetivo: probar la ingesta de forma progresiva, no masiva.

Orden obligatorio:

1. `npm run probe:vtex -- --source=disco --query=leche --count=1`
2. `INGESTION_V2=shadow npm run ingest -- --dry-run --source=disco --limit=1`
3. Solo con aprobación explícita: corrida mínima no dry-run de una fuente.
4. Solo después de evidencia verde y aprobación explícita: multi-source acotado.

Registrar:

- sourceCount.
- fetched/staged/promoted/rejected/failedSources.
- source_health si aplica.
- si hubo writes reales o no.
- rollback/cleanup si hubo writes reales.

Cierre requerido:

- Dry-run verde.
- Si se autorizó write real: evidencia de registros creados/actualizados y rollback/limpieza si corresponde.
- No active/multi-source sin aprobación.

## Fase 5 — E2E público profundo, acotado y seguro

Objetivo: probar flujo público real sin romper la máquina.

Rutas mínimas:

- `/`
- `/buscar?q=leche`
- `/api/search?q=yerba&limit=1`
- `/producto/[ean]` descubierto desde API real.
- `/canasta`
- `/ofertas`
- `/categoria/[slug]` si hay categoría real.

Reglas:

- Chromium/Edge headless acotado, serial, 1 worker si aplica.
- No Playwright amplio sin justificación y aprobación.
- Capturar screenshots solo de rutas clave.
- Si no hay datos reales para un flujo, marcar gate como no cerrado; no fakear.
- Confirmar que el servidor usado para smoke quede apagado al final.

Cierre requerido:

- Sin 500 visible.
- Sin Prisma overlay.
- Sin claim regression.
- Screenshots/evidencia guardados en `docs/screenshots/` o `docs/reports/`.

## Fase 6 — Admin / Clerk / promociones

Objetivo: validar admin sin abrir brechas ni inventar producción.

Verificar:

- middleware Clerk.
- allowlist/admin role.
- rutas admin.
- APIs admin.

Escrituras DB:

- Crear promoción temporal solo con aprobación explícita.
- Registrar payload, ID, visibilidad en `/ofertas`, y borrado.
- Verificar que no queden datos temporales vivos.

Cierre requerido:

- Auth/admin gate probado o documentado como pendiente por falta de credenciales/permiso.
- No dejar datos temporales vivos.

## Fase 7 — Performance / complexity report-only scan

Objetivo: encontrar riesgos de complejidad sin optimizar prematuramente.

Modo por defecto: report-only.

Analizar:

- O(n), O(n*m), repeated scans.
- N+1 DB/API calls.
- repeated filter/map/sort.
- rutas pesadas de render/runtime.
- scripts de ingesta.

Áreas sugeridas:

- `src/lib/catalog.ts`
- `src/app/api/search/route.ts`
- `src/app/canasta/page.tsx`
- `src/components/canasta-page.tsx`
- `scripts/ingest.ts`
- `scripts/pipeline/*.ts`
- `src/lib/ingestion/**/*.ts`
- `src/lib/vtex/**/*.ts`

Output requerido:

- finding.
- archivo/línea.
- complejidad actual.
- complejidad sugerida.
- riesgo.
- test necesario.
- si conviene hacer ahora o diferir.

Cierre requerido:

- Reporte markdown guardado.
- Sin cambios de código salvo aprobación posterior.
- Hallazgos High deben convertirse en fase propia antes de optimizar.

## Fase 8 — GitHub / portfolio proof pack

Objetivo: dejar el repo presentable y defendible.

Verificar/actualizar:

- `README.md`
- screenshots reales.
- arquitectura.
- stack.
- comandos de verificación.
- qué está implementado.
- qué falta.
- no claims inflados.
- badges solo si son reales.

Cierre requerido:

- README honesto y recruiter-friendly.
- proof pack con comandos, screenshots y límites claros.
- `docs/handoff.md` final.

## Gate final — Auditoría de cierre

Antes de marcar el goal completo:

1. Restate objective como checklist concreto.
2. Mapear cada fase a:
   - estado: `GREEN`, `BLOCKED_APPROVED` o `STOPPED`;
   - archivo/commit;
   - comando ejecutado;
   - resultado;
   - evidencia guardada;
   - pendiente si existe.
3. Ejecutar verificación final mínima:
   - `npm test`
   - `npm run typecheck`
   - `npm run lint`
   - `npm run build` si la fase Build/PWA se ejecutó o no fue explícitamente diferida.
4. `git status --short` debe estar limpio.
5. Revisar commits recientes:
   - convencionales;
   - sin Co-Authored-By;
   - sin atribución AI.
6. Actualizar memoria/handoff.

Criterio para decir “cerrado”:

- Todas las fases ejecutadas están verdes.
- Las fases no ejecutadas están explícitamente diferidas con razón y aprobación.
- No hay blockers ocultos.
- No hay claims production-ready si build/deploy/E2E/secrets siguen pendientes.
- Working tree limpio.

Si algo no puede cerrarse, detenerse y reportar exactamente:

- qué falló;
- evidencia;
- impacto;
- siguiente acción recomendada;
- si requiere aprobación del usuario.

## Loopholes cerrados en esta versión

- Se define que la confianza aplica a la estrategia/gatekeeping, no al resultado de producción.
- Se agregan estados formales `GREEN`, `BLOCKED_APPROVED`, `STOPPED`.
- Se prohíbe usar evidencia vieja como cierre.
- Se agregan aprobaciones obligatorias antes de escrituras reales, dependencia nueva, E2E amplio, deploy/push y cambios de dashboards/secrets.
- Se exige guardar evidencia en paths versionables, no solo en `%TEMP%`.
- Se separa build/PWA de continuity readiness y se impide aceptar `DISABLE_PWA=true` como solución silenciosa.
- Se agregan comandos seguros para secrets sin imprimir valores.
- Se obliga a apagar servidores de smoke.
- Se exige convertir hallazgos High de performance en fase propia antes de tocar código.
