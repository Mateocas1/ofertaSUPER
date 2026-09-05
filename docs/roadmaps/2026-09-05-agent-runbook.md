# Runbook del agente: una unidad verificable por vez

**Programa:** [roadmap y contratos](2026-09-05-audit-discovery-freshness.md). **Seguimiento:** [#460](https://github.com/Mateocas1/ofertaSUPER/issues/460).
Este runbook guía trabajo futuro autorizado. Su publicación no autoriza código, builds, acceso a recursos, escrituras, cambios de roles ni despliegues. No ejecutar las 18 unidades como un único prompt de implementación.

## 1. Punto de entrada

Empezar por **OS-00**: contrastar HEAD con `b999298b755288d47c645185e00e154f62b9aca1`, reconciliar estados y proponer el siguiente issue o reusar uno vigente. Leer `AGENTS.md`, instrucciones locales y contratos canónicos; para Next, la documentación de la versión instalada exigida por el repositorio.
No aplicar `status:approved` por iniciativa del agente. No cerrar #405/#395/#459/#337 por el mero merge de documentación. Mantener WIP=1 salvo autorización explícita de trabajo paralelo con ámbitos no superpuestos.

## 2. Contrato de entrada de cada unidad

Antes de editar, dejar una ficha en el issue/PR de esa unidad; no crear otro sistema de tracking. Todo campo que habilita ejecución debe tener valor o la fase queda bloqueada.

| Campo | Debe identificar |
|---|---|
| Unidad y resultado | OS-ID, criterio de éxito concreto, issue existente o nuevo y aprobación necesaria. |
| Snapshot | Repo, SHA base, estado del worktree y diferencias desde la auditoría. No descartar trabajo ajeno. |
| Dependencias | Evidencia de gates previos y cuáles no aplican, con motivo aceptado. |
| Alcance | Archivos permitidos, interfaces afectadas, fuente/contexto/cohorte y exclusiones. |
| Ejecución | Comandos permitidos, entorno aislado/live, recursos, budget y tiempo de vida de autorización. |
| Verificación | Casos RED, comandos de test, pruebas de integración/browser necesarias y evidencia esperada. |
| Riesgos | Stop, rollback, responsable y efectos externos posibles. |
| Revisión | Pronóstico de additions+deletions, generación de archivos y división en PR si corresponde. |

Aplicar el presupuesto vigente del repo/issue; referencia habitual: ≤400 líneas authored añadidas+borradas por unidad. No comprimir código/documentación para eludirlo. Una excepción debe aprobarse, no inferirse de esta planificación. Tests y documentación del comportamiento se revisan con la unidad; no borrar evidencia para ahorrar diff.

## 3. Ciclo de ejecución

1. **Reconciliar:** leer código y evidencia actuales; confirmar o refutar el hallazgo. Encontrar consumidores, PR relacionados y reglas existentes. Reutilizar lo que ya funciona.
2. **Preparar:** completar ficha y dependencias. Si falta permiso o recurso, devolver bloqueo exacto y el siguiente paso seguro, sin probar credenciales o ejecutar datos live.
3. **RED:** escribir el caso que distingue conducta correcta de incorrecta; comprobar que falla por la razón esperada. Un test que falla por setup no demuestra el defecto.
4. **GREEN/TRIANGULATE:** cambio mínimo; caso positivo, caso adversarial y caso de regresión. Para refactors, caracterización previa y equivalencia después.
5. **REFACTOR:** nombres y límites de dominio claros, sin nuevas capas innecesarias. Medir deuda con el analizador existente y revisar la regla completa, no solo cada helper.
6. **Verificar y entregar:** diff completo, comandos autorizados, efectos, cleanup, evidencia y limitaciones. Abrir PR pequeño enlazado a la unidad y `Refs #460`; nunca mergear ni encadenar operaciones live por implicación.

Cuando el issue exija `npm test` en cada checkpoint, seguirlo. El flujo resumido no debilita TDD, allowlists ni gates de #395/#459. Un nuevo problema fuera del alcance se registra; no se arregla silenciosamente dentro del mismo PR.

## 4. Verificación mínima y evidencia

Comandos existentes para un checkout autorizado; no se ejecutaron como parte de crear este runbook:

```sh
npm test
npm run typecheck
npm run lint
npm run audit:complexity
npm run audit:complexity -- --json
```

Instalación, generación Prisma, auditorías de dependencias, build, navegador y DB aislada requieren revisar el contrato de la unidad. No ejecutar `npm ci` con entorno productivo heredado; mantener secretos fuera de tests. No presentar `npm audit` de desarrollo como diagnóstico de producción ni aceptar ausencia de findings como prueba completa de seguridad.
La evidencia anota SHA, árbol/lockfile cuando aplique, ambiente sin secretos, instante UTC, comando exacto, exit code, aserciones y artefactos permitidos. Hora local de coordinación: America/Argentina/Buenos_Aires. No sustituir fecha de fuente por fecha de ejecución.
En cada cierre distinguir **inspección**, **mock/unit**, **integración aislada**, **live observado** y **aceptación humana**. Capturas o string tests no sustituyen probar interacción, revocación con Redis, restauración o comportamiento real de proveedor.
Usar el directorio de evidencia permitido por cada contrato. El probe VTEX que prohíbe persistencia conserva esa prohibición: solo registrar lo autorizado, nunca cookies, headers, cuerpos ni errores brutos. Limpiar únicamente recursos propios y temporales identificados.

## 5. Stop, rollback y cierre

Detener la fase afectada ante dependencia incumplida, identidad/contexto ambiguo, evidencia caducada, cambio de scope, permisos faltantes, lock fallido, revocación, bloqueo de fuente, exceder presupuesto o postwrite fallido.
No aumentar retries/concurrencia, cambiar endpoint, regenerar baseline, activar fallback demo ni reducir SLO para lograr verde. Un timeout/429 no significa producto ausente. Una fuente stale puede recibir planificación de recuperación si safety PASS; no es permiso de escritura.
Para código puro: revertir la unidad sin devolver una frontera insegura a producción. Para datos: detener nuevos batches, conciliar efectos, usar preimagen/IDs exactos y comprobar referencias posteriores. Para publicación: negar evidencia no válida, sin exigir un purge externo no autorizado.
El cierre del issue/PR debe contener: resultado frente al gate, archivos/contratos cambiados, comandos realmente ejecutados, métricas antes/después cuando apliquen, efectos externos, prueba de rollback/cleanup, limitaciones y siguiente unidad habilitada. No escribir “todo verde” cuando una prueba está bloqueada.
En #460 enlazar ese cierre; marcar la casilla solo cuando el paquete completo cumpla sus gates. Código mergeado con live pendiente se informa como entrega parcial, no como operación comprobada. Un diferimiento necesita motivo, impacto y aprobación; no habilita el hito que dependía de ese gate.

## 6. Prompt inicial para continuar

```text
Trabajá en Mateocas1/ofertaSUPER sobre el programa #460.
Leé docs/roadmaps/2026-09-05-audit-discovery-freshness.md y
     docs/roadmaps/2026-09-05-agent-runbook.md.
Primera unidad: OS-00, en modo lectura y propuesta de documentación.
Contrastá HEAD, AGENTS.md y los issues/PR existentes antes de planificar.
No asumas que los hallazgos o métricas históricos siguen iguales.
Devolvé la ficha de entrada, estado reconciliado, gates pendientes y el
siguiente trabajo acotado; reutilizá un issue existente cuando corresponda.
No apruebes issues, no implementes otras unidades y no ejecutes live, writes,
migraciones, builds, scheduler, cambios de secretos o despliegues.
Para continuar con implementación necesitarás el alcance y permiso de esa unidad.
```

Si el PR documental todavía no está integrado, leer estos dos archivos en su rama o SHA explícito; no cambiar de rama sobre un worktree sucio ni asumir que ya existen en master. Conservar instrucciones y resultados relevantes en GitHub, no solo en memoria de la conversación.
