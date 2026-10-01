# ofertaSUPER v1 — objetivo, gates y guardrails

> **Autoridad única de ejecución desde 2026-09-27.** Reemplaza como guía de trabajo a `goal.md`, `odd/tasks/*`, el ledger del PR #499 y la puerta G04 de la issue #498. Esos documentos quedan como historia. Si algo de ellos contradice este archivo, gana este archivo.

## Objetivo final (lo que quiere el dueño del producto)

Entrar a la página y:

1. Buscar un producto fácilmente y ver sus resultados en los supermercados disponibles.
2. En cada resultado: **supermercado, precio, si está en oferta** y cuándo se actualizó.
3. Entrar al producto: precio en cada súper, la oferta y el **historial de precios**.
4. Agregar al **carrito**, que se puede **mezclar entre supermercados**.
5. Horizonte (después de v1): **máximos supermercados, máximo catálogo, precios lo más actualizados posible**.

## Definición de "terminado v1"

En la URL pública `https://ofertas-super.vercel.app`, con datos **reales** (nunca demo):

- [ ] Buscar "leche", "aceite" y "arroz" devuelve productos reales de Carrefour, Disco y Jumbo, con paginación más allá de 24 resultados.
- [ ] Cada resultado muestra súper, precio, oferta (si hay) y fecha de actualización.
- [ ] La ficha `/producto/[ean]` muestra precio por súper, oferta e historial de precios.
- [ ] "Oferta" = precio tachado (precio de lista mayor que el precio) **más** promos simples publicadas en el producto (2x1, 2da al 50%, porcentaje) si la fuente las expone. Descuentos de banco y billetera: fuera.
- [ ] El carrito muestra (a) la mejor mezcla automática entre súpers, (b) la mejor canasta en un solo súper y (c) permite cambiar a mano el súper de cada producto. Un producto sin precio cuenta como faltante; nunca se muestra "completa" si falta algo.
- [ ] Los precios se actualizan al menos una vez por día. El día del cierre, ≥90% de las ofertas tienen menos de 24 h.
- [ ] CI de master en verde: tests completos, typecheck, lint y complejidad.

**Fuera de v1:** piloto con usuarios, más supermercados, crecer el catálogo, cuentas, checkout, promos bancarias. Se hacen después y no bloquean el cierre.

## Estado de partida (2026-09-27)

- Base local PostgreSQL (contenedor `ofertasuper-cmvp-local-bootstrap-postgres-1`, volumen `ofertasuper-cmvp-local-bootstrap_postgres-data`): 537 productos, 728 ofertas, 500 objetivos congelados, 167 comparables. Última adquisición: 20/09.
- La adquisición real se hace con `acquire:cmvp-catalog-batch` (`scripts/acquire-cmvp-catalog-batch.ts` → `stage` → `validate` → `scripts/pipeline/reconcile.ts`). El plan de 36 lotes que la produjo está en `artifacts/cmvp/catalog/expansion-20260920-discovery-25/acquisition-plan-cycle2.json`.
- El sitio público sirve **datos demo** (`/api/search` devuelve `dataSource: "demo"`).
- La interfaz ya existe: `/buscar`, `/producto/[ean]` (con `LazyPriceChart`), `/canasta`. La base ya guarda `list_price`.
- PRs abiertos: #500 (credenciales de compose, CI verde) y #501 (lanzador de tests; CI de tests verde con 1027 tests y 0 fallas, pero el check `complexity` falla). #502, #503 y #504 quedan **pausados**: no se fusionan ni se continúan.

## Guardrails (siempre)

1. **Un gate a la vez, en orden.** No empezar el siguiente hasta cumplir el "Hecho cuando" del actual.
2. **Un solo worktree de trabajo:** `/home/picala/code/ofertaSUPER-v1` (ya tiene `node_modules` y el cliente Prisma). No crear más worktrees. No usar subagentes para escribir código; solo para lectura, si hace falta.
3. **Una rama y un PR por paso**, desde `origin/master` actualizado, de ≤400 líneas escritas a mano (el JSON generado no cuenta). Título en formato de commit convencional; cuerpo con `Refs #498`. Sin atribución de IA en commits.
4. **Antes de abrir o actualizar un PR, todo esto debe pasar localmente:**
   ```bash
   npm test && npm run typecheck && npm run lint && npm run audit:complexity && git diff --check
   ```
   Si `audit:complexity` falla, simplificar la función. **Prohibido** agregarla al baseline o crear excepciones.
5. **TDD para cambios de comportamiento:** primero una prueba que falle por el motivo correcto, después el código mínimo.
6. **Las pruebas verifican comportamiento, no texto.** Prohibido escribir tests que lean el contenido de otro archivo con regex o grep.
7. **Prohibido crear:** scripts `audit:*` nuevos, gates, ledgers, recibos, capas de autoridad o publicación, flags de procedencia, kill switches u orquestadores. Si parece necesario, se consulta primero.
8. **No tocar** el subsistema `direct-refresh*`, `production-readiness*`, `catalog-authority` ni los modelos de gobierno del schema, salvo para desconectarlos de la lectura pública en el Gate 3. Borrarlos queda para después de v1.
9. **Migraciones de base de datos:** solo con aprobación previa del orquestador. Además deben ser aditivas y nullable.
10. **Datos:** antes de la primera escritura real a la base local, hacer un respaldo:
    ```bash
    mkdir -p ~/backups && docker exec ofertasuper-cmvp-local-bootstrap-postgres-1 pg_dump -U ofertasuper_owner -d ofertasuper -Fc > ~/backups/ofertasuper-$(date +%F).dump && ls -la ~/backups
    ```
    El archivo debe pesar más de 0 bytes. Prohibido `DROP`, `TRUNCATE`, `docker volume rm` y `docker compose down -v`.
11. **Secretos:** nunca imprimirlos ni commitearlos. `.env*` no se edita; si hace falta un valor, pedírselo al usuario.
12. **Merge:** se permite `gh pr merge <n> --merge --delete-branch` solo si todos los checks del PR están en verde y el "Hecho cuando" del paso se cumple. **Excepción:** el PR del Gate 3 que cambia la lectura pública necesita el OK explícito del orquestador o del usuario antes del merge.
13. **Next.js:** esta versión tiene cambios incompatibles. Antes de tocar código de framework, leer la guía correspondiente en `node_modules/next/dist/docs/`.
14. **Nunca afirmar algo que no se haya visto.** Si una verificación no se pudo correr, decirlo.

## Cuándo parar y consultar

Hay que parar y consultar en estos casos:

- El mismo check falla dos veces seguidas en CI por el mismo motivo.
- Hace falta una migración, un secreto, cambiar configuración de Vercel o de GitHub, o borrar algo.
- El cambio supera 400 líneas o toca el `src` de otro gate.
- Una fuente (Carrefour, Disco o Jumbo) devuelve errores o bloqueos en más del 20% de los pedidos.
- El trabajo parece requerir algo prohibido por los guardrails.

Para consultar: enviar un mensaje a la sesión orquestadora `01a0e181-8494-77c9-b03b-7a3c182293fb` con `orchestrator_send_message`, o escribirlo en el chat y detenerse.

## Formato de reporte (al cerrar cada gate)

```
Gate N — <nombre>: CUMPLIDO | BLOQUEADO
PRs: #… (merge sha …)
Verificación: npm test <tests/pass/fail/skip>, typecheck, lint, complexity, CI <link>
Evidencia del "Hecho cuando": <qué se observó, con comando o URL>
Pendiente / riesgos: …
Siguiente: Gate N+1
```

---

## Gate 0 — Plan versionado y mesa limpia

- **Hacer:**
  1. En el worktree v1, `git switch -c docs/v1-plan origin/master`. Commitear `docs/v1-plan.md` y el puntero en `AGENTS.md` (ya escritos, sin commitear). Abrir el PR y hacer merge cuando CI esté verde.
  2. Comentar en #502, #503 y #504: "Pausado: fuera del plan v1 (docs/v1-plan.md). Se conserva como referencia; no fusionar." Dejarlos en draft.
  3. Comentar en #498 con el enlace a `docs/v1-plan.md` y la definición de terminado v1. No cerrar #498 ni #499.
- **Hecho cuando:** `docs/v1-plan.md` está en master y los tres PRs tienen el comentario.

## Gate 1 — Suite confiable en master

- **#500:** CI ya está verde. Hacer merge.
- **#501:** el check `complexity` falla por `resolveTsxLoaderPath` y `runLauncher` en `scripts/run-tests.mjs`.
  - Arreglo esperado: **eliminar** `resolveTsxLoaderPath` y lanzar `process.execPath` con `["--import", "tsx", "--conditions=react-server", "--test", "--test-concurrency=4", ...files]` y `cwd: repoRoot`. Node resuelve `tsx` desde `node_modules`.
  - Conservar `--list` y la enumeración recursiva.
  - En `tests/test-discovery.test.ts`, quitar los tests del resolvedor eliminado y conservar los de descubrimiento.
  - Trabajar con `git switch -c fix/501-complexity origin/p2/suite-trustworthiness`, rebasar sobre master después del merge de #500, y hacer `git push origin HEAD:p2/suite-trustworthiness`.
- **Hecho cuando:**
  - #500 y #501 están fusionados.
  - El CI de master (workflow "Lighthouse CI") está verde.
  - `npm test` reporta ≥1027 tests y 0 fallas.

## Gate 2 — Datos verdaderos y dependencias seguras

Tres PRs chicos, en este orden:

1. **Dependencias:**
   - Subir `next`, `@next/env` y paquetes relacionados a la última 16.3.x parcheada (≥16.3.3) y `sharp` a ≥0.35.4. Sin `npm audit fix --force`.
   - Hecho cuando: `npm audit --omit=dev` no tiene críticos ni altos, y `npm run build` pasa.
2. **Fecha de observación en `reconcile.ts`:**
   - `scripts/pipeline/reconcile.ts` debe escribir `last_checked_at` y `price_history.scraped_at` con la hora en que se **obtuvo** el dato de la fuente (la guardada en staging al adquirir), no con `new Date()` al procesar.
   - Una fila ya `PROMOTED` que se reprocesa no cambia fechas ni duplica historial.
   - Tests (TDD):
     - dato adquirido el 18/09 y procesado el 21/09 queda con fecha 18/09;
     - un replay no modifica nada.
3. **Disponibilidad desconocida:**
   - En `src/lib/vtex/normalize.ts:146`, cuando la fuente no informa disponibilidad, el valor no puede terminar en `true`. Tratarla como **no elegible** para comparar y para el carrito, sin migración.
   - Test (TDD): con dato ausente, la oferta queda no elegible; con `false` explícito, sigue siendo `false`.
- **Hecho cuando:** los tres PRs están fusionados con CI verde.

## Gate 3 — El sitio muestra el catálogo real (el más importante)

**Arquitectura acordada:**

1. La base local PostgreSQL genera un **snapshot JSON versionado** con lo que usa la interfaz:
   - por producto: EAN, nombre, marca, imagen y categoría;
   - por oferta: súper, precio, precio de lista, promo (vacío hasta el Gate 4), disponible (sí/no/desconocido), URL del producto en la fuente y fecha de observación;
   - por oferta, historial de precios de los últimos 90 días;
   - fecha de generación del snapshot.
2. El snapshot se commitea en el repo (por ejemplo `data/catalog-snapshot.json`) y Vercel lo sirve en el build.
3. **Todas** las superficies públicas leen ese snapshot: `/buscar`, `/producto/[ean]`, `/canasta`, `/api/search`, `/api/products/*` y las categorías u ofertas que queden visibles.
4. Nada de demo. Si falta el snapshot, se muestra "no disponible".
5. La frescura se calcula al **leer** (fecha de observación contra la hora actual), nunca guardada como booleano.

**Pasos:**

- **3a (checkpoint obligatorio).** Antes de escribir código, enviar al orquestador un diseño de ≤40 líneas:
  - forma del JSON;
  - archivo del exportador;
  - archivo del lector;
  - lista exacta de rutas y componentes a cambiar;
  - qué módulos viejos de lectura (`public-catalog-read.server.ts`, `serving*`, `portfolio-catalog.ts`) quedan desconectados.

  Esperar el OK.
- **3b.** Exportador + lector + tests (PR 1). Cambio de rutas y API al lector (PR 2, o varios si supera 400 líneas).
- **3c.** Generar el snapshot desde la base local actual y verificar el preview de Vercel del PR. Enviar la URL del preview al orquestador y esperar el OK antes del merge.

**Hecho cuando:**

- En producción, `/api/search?q=leche` devuelve productos reales sin `dataSource: "demo"`.
- `/buscar?q=aceite` tiene paginación.
- `/producto/<un EAN comparable>` muestra los tres súpers (o los que tengan el producto) y su historial.

Los precios pueden estar viejos todavía; eso se resuelve en el Gate 6.

## Gate 4 — Ofertas visibles

- **4a. Precio tachado:** si `list_price > price`, mostrar el precio de lista tachado y el porcentaje de descuento en resultados, ficha y carrito. Usar una sola función pura compartida.
- **4b. Sonda de promos simples (checkpoint):**
  - Con un script de lectura, pedir 10 productos por súper a Carrefour, Disco y Jumbo y registrar si la respuesta VTEX trae `Teasers`, `PromotionTeasers`, `DiscountHighLight` u otro campo de promo por producto.
  - Informar al orquestador qué campos existen y con qué forma, y esperar el OK.
  - Si guardarlas requiere migración, aplica el guardrail 9.
- **4c.** Capturar las promos simples que existan (2x1, 2da al 50%, porcentaje), llevarlas al snapshot y mostrarlas como etiqueta. No calcular precios con promos bancarias.
- **Hecho cuando:** en producción se ven productos con precio tachado y, si la fuente las expone, etiquetas de promo simple.

## Gate 5 — Carrito mezclable y correcto

En `src/components/canasta-page.tsx` y `src/lib/basket-*` (reusar el estado local actual, sin cuentas):

1. **Bug (primero, con TDD):** cada EAN pedido cuenta en el denominador de todos los súpers. Un producto sin resolver es faltante, nunca se descarta. Caso de prueba: A×2 + B×1, con A=$1000 solo en Disco y B ausente, da subtotal $2000, 1/2 cubierto, 1 faltante y sin etiqueta "completa".
2. **Mezcla automática:** cada producto se asigna al súper más barato con oferta elegible (disponible y con precio). Mostrar el total mezclado y cuánto se ahorra frente a la mejor canasta en un solo súper.
3. **Mejor canasta en un solo súper:** la comparación actual, corregida.
4. **Cambio manual:** en cada producto del carrito, un selector de súper. Por defecto, el más barato. La elección se guarda en el estado local.
5. Las cantidades multiplican el precio.

- **Hecho cuando:** tests de las cuatro reglas en verde, y en producción se puede armar un carrito de 5 productos, ver los dos totales y cambiar un súper a mano.

## Gate 6 — Actualización diaria

1. Crear **un** script `scripts/refresh-catalog.ts`, que será el único comando de actualización:
   - recorre los 36 lotes del plan `acquisition-plan-cycle2.json` con `batchId` nuevos por día (por ejemplo `v1-refresh-<YYYYMMDD>-<ordinal>`); el mismo `batchId` hace replay y no vuelve a consultar;
   - llama a la misma lógica de `acquire-cmvp-catalog-batch`;
   - regenera el snapshot;
   - imprime el resumen: lotes ok/fallidos y porcentaje de ofertas <24 h por súper.

   Agregar `npm run refresh:catalog`.
2. Respaldo previo (guardrail 10). Ejecutarlo una vez y verificar que el porcentaje de ofertas <24 h sea ≥90% en cada súper.
3. Publicar: commitear el snapshot nuevo en un PR `chore(catalog): refresh <fecha>` y hacer merge con CI verde.
4. Documentar en `docs/v1-plan.md` (sección Runbook, al final) el comando diario exacto y cómo programarlo con cron en esta máquina. No crear el cron sin el OK del usuario.
5. Repetir al día siguiente. El historial de la ficha debe mostrar al menos dos puntos.

- **Hecho cuando:** dos actualizaciones en días distintos publicadas en producción, con ≥90% de ofertas <24 h en cada súper el día de la segunda.

## Gate 7 — Cierre v1

- Recorrer en producción, en móvil y en escritorio, cada ítem de "Definición de terminado v1" y registrar lo observado (captura o respuesta HTTP) en `docs/reports/v1-closure.md`, de ≤60 líneas.
- Actualizar `README.md`: qué hace, cómo actualizar el catálogo y los límites honestos (por ejemplo, disponibilidad como observación de la fuente).
- **Hecho cuando:** todas las casillas de "terminado v1" están marcadas con evidencia. Recién ahí se propone al usuario cerrar #498 y planificar el crecimiento (más catálogo, más súpers, limpieza de subsistemas sin uso).

## Runbook

_(Completado en el Gate 6, 2026-09-28.)_

### Actualización diaria del catálogo

1. **Respaldo previo** (guardrail 10), antes de la primera escritura del día:
   ```bash
   mkdir -p ~/backups && docker exec ofertasuper-cmvp-local-bootstrap-postgres-1 pg_dump -U ofertasuper_owner -d ofertasuper -Fc > ~/backups/ofertasuper-$(date +%F).dump && ls -la ~/backups
   ```
   El archivo debe pesar más de 0 bytes.
2. **Refresh + snapshot** (un solo comando; la base local corre en docker y el comando se ejecuta desde el worktree con `DATABASE_URL` apuntando a ella — ver nota):
   ```bash
   npm run refresh:catalog
   ```
   - Recorre los 36 lotes del plan `acquisition-plan-cycle2.json` con `batchId` del día (`v1-refresh-<YYYYMMDD>-<ordinal>`); un lote ya completado hace replay desde su checkpoint y no vuelve a consultar.
   - Captura promos simples de Carrefour (PromotionTeasers por EAN, lectura REST pública) durante el staging; una lectura fallida deja promo null y cuenta en el resumen sin abortar el lote.
   - Regenera `data/catalog-snapshot.json` e imprime el resumen: lotes ok/fallidos, promos capturadas/lecturas fallidas y % de ofertas <24 h por súper. Sale con error si hay lotes fallidos o el peor súper queda por debajo de 90%.
3. **Publicar:** commitear el snapshot nuevo en un PR `chore(catalog): refresh <fecha>` y hacer merge con CI verde.
4. **Repetir al día siguiente.** El historial de la ficha debe mostrar al menos dos puntos.

**Nota de ejecución local:** la base del bootstrap no publica puertos al host. Dos formas válidas de ejecutar el paso 2:
- desde un contenedor en la red del bootstrap con el repo montado (como lo corrió el Gate 6), o
- desde el host si `DATABASE_URL` alcanza la base (por ejemplo publicando el puerto).

El hash de la consulta persistida de VTEX se toma de `ingestion_run.vtex_hash` (lo guarda la propia adquisición); no se pide ni se imprime.

### Relectura por EAN (top-up)

Al final del refresh, cada oferta que la corrida no observó se relee por EAN con el endpoint REST público de su súper (el mismo de la captura de promos). Se guarda con el mismo instante de observación y el mismo formato de staging; en Carrefour también la promo. Producto ausente o sin stock → `available=false` y precio null (nunca se inventa precio). Las lecturas fallidas cuentan en el resumen (`top-up reads ok/failed`) sin abortar la corrida. Con el top-up, el primer día se alcanzó 100% <24 h en los tres súpers (327 lecturas, 0 fallas).

### Restauración del Postgres local

- La contraseña vive en `~/.config/ofertasuper/postgres.env` (600, nunca commitear) junto con `APP_PASSWORD`, que el compose interpola aunque solo se levante postgres.
- Levantar solo la base: `docker compose --env-file ~/.config/ofertasuper/postgres.env up -d postgres` (desde el repo; no corre migrate ni seed).
- Sobre un volumen ya inicializado ese env es inerte: si la contraseña del rol no coincide con la del env, sincronizarla por socket local (`docker exec ... psql -c "ALTER USER ..."`) y hacer un backup fresco con nombre distinto (por ejemplo `ofertasuper-<fecha>-post-restore.dump`).

### Cron diario

1. **Script**: `scripts/cron-refresh.sh`. Trabaja en un worktree dedicado `~/code/ofertaSUPER-refresh` (excepción aprobada al guardrail de worktree único) que antes de cada corrida vuelve a `origin/master` (fetch + checkout detach; nunca toca otros worktrees). Usa `flock` para evitar corridas superpuestas.
2. **Respaldo**: el script hace el `pg_dump` del día antes de escribir (guardrail 10).
3. **Publicación**: crea la rama `chore/catalog-refresh-<YYYYMMDD>`, commitea SOLO `data/catalog-snapshot.json`, abre PR y corre `gh pr merge --auto --merge --delete-branch`; si el repo no admite auto-merge, espera los checks con `gh pr checks --watch` y mergea solo en verde.
4. **Frenos**: si el refresh falla (lotes fallidos, frescura <90% o una fuente con >20% de lecturas fallidas), NO abre el PR: escribe el motivo en el log y sale con código ≠0.
5. **Log**: `~/.local/state/ofertasuper/refresh-<fecha>.log`.
6. **crontab** (desde las 07:00 hora de Argentina = 10:00 UTC; el sistema está en UTC). Corre cada hora hasta las 23:00 UTC para recuperar el día si la PC estaba apagada o Docker caído; el script sale sin hacer nada si ese día ya hubo un intento (marca `~/.local/state/ofertasuper/attempted-<fecha>`, que se escribe justo antes del refresh, así que un freno de frescura no se reintenta):
   ```
   0 10-23 * * * $HOME/.local/bin/ofertasuper-refresh
   ```
   Ver con `crontab -l`; pausar comentando la línea (`crontab -e`); el log de cada corrida queda en el path del punto 5. Para forzar otra corrida el mismo día, borrar la marca `attempted-<fecha>`.
7. **Postgres**: el contenedor `ofertasuper-cmvp-local-bootstrap-postgres-1` tiene `restart: unless-stopped` (`docker update --restart unless-stopped ...`) y además el script lo arranca si lo encuentra detenido.

### Cobertura de frescura (limitación conocida)

Los 36 lotes buscan por término y toman los primeros 25 resultados por búsqueda. Con la rotación de ranking de cada súper, ~15% de las ofertas del catálogo puede quedar fuera de la cobertura del día (productos que hoy no aparecen en el top-25 de su término). El primer refresh (2026-09-28) quedó en 79.6% / 85.5% / 84.1% por súper, por debajo del objetivo de 90%: se reportó al orquestador con las opciones (ampliar cobertura por EAN o aceptar la cobertura parcial en v1).
