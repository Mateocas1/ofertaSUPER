# /goal - ofertasSUPER professional readiness: GitHub, demo, portfolio, CV y LinkedIn

/goal Cerrar ofertasSUPER como proyecto principal de presentacion profesional sin inflar claims, sin tapar riesgos y avanzando por gates estrictos: una fase solo habilita la siguiente si queda GREEN con evidencia fresca, o BLOCKED_APPROVED con aprobacion explicita del usuario.

## North Star

ofertasSUPER debe quedar defendible ante recruiter y entrevista tecnica como proyecto full-stack/product engineering real: comparador de precios/ofertas con busqueda, canasta, APIs publicas, Prisma/Supabase, ingesta VTEX, Redis/fail-open, schedulers/admin y documentacion operativa.

El objetivo no es decir "production-ready" por ansiedad. El objetivo es poder decir, honestamente:

> Proyecto production-oriented y portfolio-grade, con demo/smoke verificado, limites operativos documentados y proximos pasos reales.

## Contexto especifico

- Proyecto principal: `C:\Users\picala\Documents\ofertasSUPER`.
- Repo remoto: `git@github.com:Mateocas1/ofertaSUPER.git`.
- Rama esperada: `master`.
- Proyecto portfolio lead: `ofertasSUPER`.
- Segundo caso fuerte: `test-kimi`.
- No continuar `ofertasas` salvo verificacion puntual.
- No tocar portfolio/CV/LinkedIn hasta llegar a sus fases.
- Ultimo cierre fuerte recordado: `b2ac487 docs(readiness): add final readiness audit`.
- Supabase/Prisma local ya fue corregido:
  - `DATABASE_URL` usa Supavisor transaction pooler `:6543`.
  - `DIRECT_URL` usa Supavisor session pooler `:5432`.
  - `npx prisma migrate status --schema prisma/schema.prisma` paso con "Database schema is up to date!" despues de quitar corchetes del password.
- Supabase CLI funciona via `npx supabase`; no asumir CLI global.
- Supabase aun reporto RLS critico en 11 tablas publicas:
  - `public._prisma_migrations`
  - `public.categories`
  - `public.ingestion_run`
  - `public.price_history`
  - `public.products`
  - `public.promotion_products`
  - `public.promotions`
  - `public.source_health`
  - `public.staging_product`
  - `public.supermarket_products`
  - `public.supermarkets`
- GitHub Actions fallan por secrets vacios en repository Actions, no por codigo:
  - `DATABASE_URL`
  - `DIRECT_URL`
  - `VTEX_SHA256_HASH`
  - opcionales: Upstash/webhook.
- GitHub Actions no bloquea Vercel, pero si afecta la percepcion publica del repo.

## Estados formales

| Estado | Significado |
|---|---|
| `GREEN` | Verificado con evidencia fresca del run actual. |
| `BLOCKED_APPROVED` | Bloqueado por credencial, dashboard externo, decision humana o riesgo aceptado explicitamente por el usuario. |
| `STOPPED` | Bloqueo no aprobado. No avanzar. |

Evidencia vieja sirve como contexto, no como cierre.

## Reglas duras

- No claims "production-ready", "deploy cerrado", "listo para produccion" o "experiencia laboral formal" sin evidencia real.
- No Co-Authored-By ni atribucion AI en commits.
- Commits convencionales, chicos y por work-unit.
- Tests junto al cambio relacionado.
- Si se cambia logica: TDD cuando sea viable. Primero test que falle, luego implementacion minima, luego verde.
- KISS/YAGNI: no agregar features nuevas para mejorar la historia. Cerrar readiness, no expandir producto.
- DRY: no duplicar runbooks/checklists si ya existe uno correcto; actualizarlo.
- No imprimir secretos. Mostrar solo host, puerto, nombre de variable o presencia/ausencia.
- No correr ingesta activa, writes reales, SQL de RLS, cambios de dashboard, deploy/publish o E2E amplio sin aprobacion explicita.
- Si hay conflicto con cambios de otra sesion: parar, inspeccionar diff y reportar.
- Si un gate depende de dashboard externo, pedir una sola accion concreta al usuario y detenerse.

## Uso obligatorio de memoria, skills y docs

Antes de ejecutar:

1. Consultar Engram/contexto reciente:
   - `mem_context` del proyecto.
   - `mem_search` si hay dudas sobre decisiones previas.
2. Guardar en Engram cualquier decision, bugfix, descubrimiento no obvio o convencion nueva.
3. Al cerrar, guardar session summary con objetivo, descubrimientos, logrado, pendientes y archivos relevantes.

Skills segun fase:

- `superpowers:systematic-debugging` ante cualquier fallo.
- `superpowers:verification-before-completion` antes de afirmar que algo esta verde.
- `superpowers:test-driven-development` si se cambia logica.
- `work-unit-commits` para dividir commits.
- `cognitive-doc-design` para README, handoff, proof pack, portfolio y LinkedIn docs.
- `codex-security:security-scan` o equivalente si se toca RLS/policies/security posture.
- `find-docs` / Context7 para Supabase, Prisma, Vercel, GitHub Actions o APIs actuales.
- Browser/Playwright solo acotado y seguro para smoke visual.

Delegacion de agentes:

- Permitida solo para tareas independientes y con scope claro.
- No delegar el blocker inmediato si el resultado bloquea el proximo paso.
- Subagentes posibles:
  - agente A: auditoria RLS/Supabase report-only;
  - agente B: README/GitHub proof pack;
  - agente C: portfolio/CV/LinkedIn copy;
  - agente D: QA smoke publico.
- El agente principal integra, revisa diffs y verifica localmente.

## Evidencia versionable

Usar paths claros:

- `docs/handoff.md`
- `docs/reports/production-readiness/<YYYY-MM-DD>-<phase>.md`
- `docs/reports/production-readiness/<YYYY-MM-DD>-final-audit.md`
- `docs/screenshots/<YYYY-MM-DD>-<flow>.png`
- `README.md`
- documentos del portfolio/CV/LinkedIn donde corresponda.

No dejar evidencia final solo en `%TEMP%`.

---

# Gate 0 - Identidad, seguridad y baseline

## Objetivo

Confirmar repo correcto, sin pisar otra sesion y con baseline verificable.

## Verificar

- `git rev-parse --show-toplevel`
- `git status --short`
- `git branch --show-current`
- `git log --oneline -5`
- `.env` y `.env.local` ignorados:
  - `git check-ignore -v .env .env.local`
- No secretos trackeados:
  - `git ls-files .env .env.local`
- Leer contexto actual:
  - `docs/handoff.md`
  - ultimo reporte en `docs/reports/production-readiness/`.

## Gate de avance

`GREEN` si:

- repo correcto;
- sin diff inesperado;
- baseline documentado si cambia algo.

`STOPPED` si:

- aparece diff ajeno no entendido;
- el repo no es `ofertasSUPER`.

---

# Fase 1 - Supabase/RLS security hardening

## Objetivo

Cerrar o documentar correctamente el riesgo RLS antes de presentar el proyecto como serio.

## Principio tecnico

No activar RLS a ciegas. Activar RLS sin policies puede bloquear accesos via Supabase API; dejarlo apagado puede exponer tablas si `anon`/`authenticated` conservan permisos. Primero entender acceso real.

## Pasos

1. Verificar conexion sin imprimir secretos:
   - parsear host/puerto de `DATABASE_URL` y `DIRECT_URL`.
   - `npx prisma validate --schema prisma/schema.prisma`
   - `npx prisma migrate status --schema prisma/schema.prisma`
   - `npx supabase db query "select 1 as ok" --db-url <DIRECT_URL>` usando variable local, sin loguear valor.
2. Ejecutar auditoria report-only:
   - `npx supabase db advisors --help`
   - si aplica: `npx supabase db advisors --db-url <DIRECT_URL> --type security`.
3. Mapear acceso real:
   - app publica lee DB solo desde Next/Prisma server-side?
   - existe cliente Supabase browser con anon key leyendo tablas directas?
   - que tablas necesitan lectura publica real?
   - que tablas nunca deben exponerse por PostgREST?
4. Proponer SQL en reporte, no aplicar todavia:
   - opcion conservadora: enable RLS + revoke anon/authenticated en tablas no publicas;
   - policies explicitas solo si hay acceso Supabase client legitimo.
5. Pedir aprobacion antes de ejecutar SQL real.
6. Si se ejecuta SQL:
   - guardar SQL aplicado en reporte;
   - re-ejecutar advisors;
   - re-ejecutar Prisma migrate status;
   - smoke API publico minimo.

## Testing minimo

- `npx prisma validate --schema prisma/schema.prisma`
- `npx prisma migrate status --schema prisma/schema.prisma`
- Si cambia SQL/RLS:
  - `npm test`
  - `npm run typecheck`
  - `npm run lint`
  - smoke de `/api/search` y una ruta publica.

## Gate de avance

`GREEN` si:

- RLS queda aplicado con policies/revokes correctos y smoke verde; o
- queda reporte honesto aprobando mantenerlo pendiente por decision explicita.

`STOPPED` si:

- no se entiende el acceso real;
- el SQL propuesto puede romper la app;
- falta aprobacion para tocar DB.

## Commit sugerido

- `docs(security): document supabase rls posture`

---

# Fase 2 - GitHub Actions hygiene

## Objetivo

Evitar que el repo publico muestre fallos recurrentes por infraestructura no configurada.

## Decision base

Si GitHub Actions no es parte del demo actual, no debe correr schedule en rojo. O se cargan secrets reales, o se convierte a ejecucion manual/guarded.

## Pasos

1. Leer workflows:
   - `.github/workflows/update-prices.yml`
   - `.github/workflows/ingest.yml`
   - `.github/workflows/cleanup.yml`
   - `.github/workflows/populate-db.yml`
   - `.github/workflows/lighthouse-ci.yml`
2. Confirmar estado de runs con API/GitHub UI si hay acceso.
3. Clasificar workflows:
   - necesarios para demo publico;
   - jobs operativos futuros;
   - jobs peligrosos si faltan secrets.
4. Elegir estrategia con aprobacion del usuario:
   - cargar GitHub Actions secrets; o
   - pausar schedules y dejar `workflow_dispatch`; o
   - agregar guards explicitos con mensaje claro.
5. Si se modifica YAML:
   - validar YAML visualmente y por parseo si hay herramienta disponible;
   - no tocar logica de ingesta.

## Testing minimo

- `npm test`
- `npm run typecheck`
- `npm run lint`
- inspeccion de YAML.
- si se cargan secrets y se dispara manualmente: verificar run manual acotado.

## Gate de avance

`GREEN` si:

- no quedan schedules que fallen por secrets ausentes; o
- secrets requeridos estan cargados y un run manual minimo pasa; o
- el riesgo queda documentado y aprobado explicitamente como no bloqueante.

`BLOCKED_APPROVED` si:

- falta acceso a GitHub Secrets y el usuario aprueba diferir.

## Commit sugerido

- `ci: pause scheduled ingestion workflows until secrets are configured`
- o `docs(ci): document required github actions secrets`.

---

# Fase 3 - Vercel deploy + smoke publico real

## Objetivo

Tener demo publica verificada. Sin demo, LinkedIn/portfolio pierde fuerza.

## Pasos

1. Confirmar repo remoto y rama usada por Vercel.
2. Preparar checklist de env vars para Vercel sin valores:
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `VTEX_SHA256_HASH`
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` si aplica
   - `CLERK_SECRET_KEY` si aplica
   - `UPSTASH_REDIS_REST_URL` si aplica
   - `UPSTASH_REDIS_REST_TOKEN` si aplica
3. Verificar si Vercel ya esta conectado al repo correcto.
4. Deploy solo con aprobacion explicita o si el usuario ya lo esta ejecutando.
5. Revisar logs de deploy si falla.
6. Smoke publico acotado sobre URL final:
   - `/`
   - `/buscar?q=leche`
   - `/api/search?q=yerba&limit=1`
   - producto sample descubierto desde API real si existe
   - `/canasta`
   - `/ofertas`
7. Guardar screenshots y reporte de smoke.

## Reglas

- No afirmar "deploy listo" hasta ver URL real y smoke verde.
- No simular success con localhost.
- Si una ruta no tiene datos, documentar "sin datos reales" en vez de fakear.
- No correr E2E amplio; smoke serial y acotado.

## Testing minimo

- Smoke HTTP con status codes.
- Browser screenshot de home y busqueda.
- `npm test`, `npm run typecheck`, `npm run lint` si hubo cambios de codigo.
- Build local solo con aprobacion explicita; Vercel build logs pueden servir como evidencia del deploy.

## Gate de avance

`GREEN` si:

- Vercel deploy esta accesible;
- rutas minimas no devuelven 500;
- screenshots/evidencia guardadas;
- limites/pendientes documentados.

`BLOCKED_APPROVED` si:

- faltan env vars/dashboard y el usuario decide diferir.

## Commit sugerido

- `docs(deploy): add vercel smoke evidence`

---

# Fase 4 - GitHub repo proof pack

## Objetivo

Dejar el repo publico facil de entender para recruiter y defendible en entrevista tecnica.

## README debe incluir

- Problema que resuelve.
- Demo URL si existe.
- Screenshots actuales.
- Stack real.
- Arquitectura breve:
  - Next.js frontend/API routes.
  - Prisma/Supabase Postgres.
  - Redis/Upstash fail-open para cache/rate-limit.
  - Ingesta VTEX/scripts/schedulers.
  - Admin/operational surfaces si estan verificadas.
- Features implementadas vs pendientes.
- Comandos locales.
- Variables necesarias sin secretos.
- Testing verificado con fecha.
- Estado honesto:
  - "portfolio-grade / production-oriented" si los gates lo respaldan;
  - no "production-ready" si RLS, deploy, E2E profundo u ops siguen pendientes.
- Badges solo si estan verdes.

## Proof pack debe mapear

| Claim | Evidencia | Archivo/comando | Estado |
|---|---|---|---|
| Busqueda publica | smoke/API/screenshot | ruta + reporte | GREEN/BLOCKED |
| Canasta | screenshot/flow | docs/screenshots | GREEN/BLOCKED |
| Prisma/Supabase | migrate status | comando | GREEN/BLOCKED |
| Ingesta | dry-run/probe | reporte | GREEN/BLOCKED |
| Seguridad | RLS report | reporte | GREEN/BLOCKED |

## Testing minimo

- `npm test`
- `npm run typecheck`
- `npm run lint`
- link checks manuales del README.

## Gate de avance

`GREEN` si:

- README cuenta una historia clara y honesta;
- todo claim fuerte apunta a evidencia;
- no hay badges rojos/enganosos;
- handoff actualizado.

## Commit sugerido

- `docs(readme): present ofertasSUPER as portfolio case study`

---

# Fase 5 - Portfolio case study

## Objetivo

Actualizar portfolio para que ofertasSUPER sea proyecto lider y explique valor tecnico sin sonar inflado.

## Scope

Tocar portfolio/CV assets solo dentro de esta fase. No tocar `ofertasas`. `test-kimi` se mantiene como segundo proyecto fuerte.

## Pasos

1. Identificar repo/carpeta actual del portfolio.
2. Verificar estado con `git status` antes de editar.
3. Actualizar seccion de proyectos:
   - ofertasSUPER primero;
   - test-kimi segundo;
   - landing/otro proyecto solo como soporte si suma.
4. Escribir case study corto:
   - problema;
   - solucion;
   - arquitectura;
   - decisiones tecnicas;
   - evidencia;
   - limites honestos;
   - link demo/repo.
5. Mantener copy recruiter-friendly:
   - concreto;
   - escaneable;
   - keywords ATS reales;
   - sin seniority inventado.
6. Verificar visualmente el portfolio si hay preview local segura.

## Testing minimo

- tests del portfolio si existen, por ejemplo:
  - `node --test tests/portfolio.test.mjs`
- lint/build solo si el proyecto lo usa y el usuario autoriza segun reglas del repo.
- browser smoke acotado si hay servidor local seguro.

## Gate de avance

`GREEN` si:

- portfolio muestra ofertasSUPER como lead project;
- links reales funcionan;
- claims son defendibles;
- visual no queda roto;
- evidencia/test guardado.

## Commit sugerido

- `docs(portfolio): feature ofertasSUPER case study`
- o commit equivalente en el repo del portfolio si es otro checkout.

---

# Fase 6 - LinkedIn, CV y activacion laboral

## Objetivo

Convertir el proyecto cerrado en senales laborales: CV, LinkedIn Featured, post tecnico y snippets para aplicar.

## Principio

No vender humo. Subir percepcion de madurez con evidencia tecnica real, no con seniority falso.

## Entregables

1. CV:
   - ofertasSUPER como proyecto principal;
   - bullets con impacto tecnico real;
   - stack y keywords ATS;
   - nada de "empresa" o "experiencia formal" si no existio.
2. LinkedIn Featured:
   - demo;
   - repo;
   - portfolio.
3. Post tecnico:
   - problema del comparador;
   - arquitectura resumida;
   - tradeoffs: Supabase/Prisma, ingesta, fail-open, RLS/security posture;
   - aprendizaje;
   - CTA profesional.
4. Application snippets:
   - mensaje corto para recruiter;
   - mensaje para dev/tech lead;
   - descripcion de proyecto para formularios.

## Revision

- Cada claim debe tener evidencia.
- Prohibido decir:
  - senior;
  - production-ready;
  - experiencia formal no real;
  - metricas inventadas;
  - usuarios/clientes reales no verificados.
- Si hay CV/portfolio tests, correrlos.

## Gate de avance

`GREEN` si:

- CV actualizado/exportable;
- LinkedIn copy listo para pegar;
- post listo;
- application snippets listos;
- links apuntan a demo/repo/portfolio reales.

`BLOCKED_APPROVED` si:

- publicacion en LinkedIn queda manual por decision del usuario.

## Commit sugerido

- `docs(career): update ofertasSUPER professional positioning`
- o commit equivalente en repo/documentos correspondientes.

---

# Gate final - Auditoria de cierre

## Objetivo

Cerrar sin autoengano. Si algo queda pendiente, debe estar escrito y aceptado.

## Reporte final requerido

Crear/actualizar:

`docs/reports/production-readiness/<YYYY-MM-DD>-professional-readiness-final-audit.md`

Debe incluir:

| Fase | Estado | Evidencia | Commit/archivo | Pendiente |
|---|---|---|---|---|
| 0 Workspace | GREEN/BLOCKED/STOPPED | comando | archivo/commit | pendiente |
| 1 Supabase/RLS | GREEN/BLOCKED/STOPPED | comando/reporte | archivo/commit | pendiente |
| 2 Actions | GREEN/BLOCKED/STOPPED | run/log/config | archivo/commit | pendiente |
| 3 Vercel smoke | GREEN/BLOCKED/STOPPED | URL/screenshot | archivo/commit | pendiente |
| 4 GitHub proof | GREEN/BLOCKED/STOPPED | README/proof | archivo/commit | pendiente |
| 5 Portfolio | GREEN/BLOCKED/STOPPED | screenshot/test | archivo/commit | pendiente |
| 6 LinkedIn/CV | GREEN/BLOCKED/STOPPED | docs/copy | archivo/commit | pendiente |

## Verificacion minima final en ofertasSUPER

Salvo bloqueo aprobado:

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npx prisma migrate status --schema prisma/schema.prisma`
- smoke publico si hay URL Vercel.

No correr build local salvo aprobacion explicita. Si hay deploy, usar Vercel build logs como evidencia.

## Git final

- `git status --short` limpio en cada repo tocado.
- Commits convencionales.
- Sin Co-Authored-By.
- Sin atribucion AI.
- Sin secretos trackeados.

## Engram final

Guardar:

- decision de RLS/security;
- estado de Actions;
- URL demo y smoke;
- posicion final del proyecto en portfolio/CV/LinkedIn;
- pendientes reales.

## Criterio para decir "cerrado para objetivo laboral"

Se puede decir cerrado solo si:

- Supabase/RLS tiene decision segura y documentada;
- GitHub publico no muestra senales rojas innecesarias;
- demo Vercel fue smokeada;
- README/proof pack esta honesto;
- portfolio usa ofertasSUPER como proyecto lider;
- CV/LinkedIn copy esta listo o publicado;
- todo claim esta respaldado por evidencia;
- working tree limpio.

Si una fase no cierra, no maquillar. Reportar:

1. que fallo;
2. evidencia exacta;
3. impacto laboral/reputacional;
4. proxima accion unica;
5. si requiere aprobacion del usuario.
