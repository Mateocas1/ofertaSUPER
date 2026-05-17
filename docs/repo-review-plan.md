# Repo review plan

Este plan convierte el working tree grande de `ofertasSUPER` en unidades revisables. No es un commit log: es la guía para publicar el repo sin mezclar evidencia técnica, ruido generado y deuda operativa.

## Estado observado

- Rama con un solo commit base: `06f5a95 feat: initial commit`.
- `git diff --stat` muestra cambios grandes en config, README, UI base, `package-lock.json` y eliminación de `temp-init/`.
- Hay muchos archivos untracked sustantivos: rutas públicas/admin, APIs, Prisma, scripts, docs, tests y workflows.
- Ya se eliminó `jaja.txt`.
- Los artefactos PWA generados quedaron ignorados en `.gitignore`.

## Orden de commits recomendado

### 1. `chore(repo): remove temporary scaffold and generated noise`

Incluye:

- baja deliberada de `temp-init/`;
- `.gitignore` con artefactos PWA/workbox ignorados;
- nada de features.

Por qué primero: limpia el piso antes de revisar producto. Si esto se mezcla con lógica de scraping, el diff se vuelve ilegible.

### 2. `feat(catalog): add supermarket catalog routes and product UX`

Incluye:

- rutas públicas (`/buscar`, `/producto/[ean]`, `/categoria`, `/ofertas`, `/canasta`);
- componentes de producto/canasta/badges/search;
- helpers de catálogo, formato, SEO y page params.

Verificación asociada:

- pruebas o smoke manual documentado cuando Supabase funcione;
- screenshots de home/search/product/cart.

### 3. `feat(ingestion): add VTEX SHA256 pipeline and operational scripts`

Incluye:

- `src/lib/vtex/`;
- `src/lib/ingestion/`;
- `scripts/ingest.ts`;
- `scripts/probe-vtex.ts`;
- scripts de cleanup/metrics;
- Prisma schema/migrations/seed si aplican a la ingesta.

Verificación asociada:

- `npm run probe:vtex` para fuentes configuradas;
- `INGESTION_V2=shadow npm run ingest -- --dry-run --source=disco --limit=1` cuando Supabase esté corregido.

### 4. `feat(admin): add protected promotions management`

Incluye:

- rutas `/admin`;
- middleware/auth admin;
- componentes y APIs de promociones.

Verificación asociada:

- acceso denegado sin sesión/admin;
- flujo admin con Clerk productivo o entorno de prueba controlado.

### 5. `test(vtex): cover VTEX request and pricing helpers`

Incluye:

- `tests/vtex.test.ts`;
- `src/lib/safe-data.ts` si queda acoplado al comportamiento testeado;
- script `npm test`.

Regla: si algún helper existe solo para la feature de ingesta, puede ir en el commit 3 junto con sus tests. No separar tests por “tipo de archivo” si rompe la historia.

### 6. `docs(portfolio): document readiness, Supabase blocker and publication checklist`

Incluye:

- `README.md`;
- `docs/production-readiness-vtex.md`;
- `docs/repo-publication-checklist.md`;
- `docs/supabase-connection-runbook.md`;
- screenshots.

Verificación asociada:

- claims auditados: no producción, no DB-backed ingest hasta Supabase, no repo limpio hasta commits.

### 7. `ci(ops): add scheduled ingestion and maintenance workflows`

Incluye:

- `.github/workflows/*`;
- `lighthouserc.json` si queda activo;
- documentación mínima de secrets.

Verificación asociada:

- revisar que workflows no impriman secretos;
- ejecutar localmente solo comandos permitidos, sin build por restricción actual.

## No mezclar

- No mezclar `package-lock.json` masivo con docs solamente.
- No mezclar `temp-init/` deletion con feature VTEX.
- No commitear generated PWA JS.
- No linkear el repo públicamente hasta que el checklist de publicación marque repo limpio o explique explícitamente la excepción.

