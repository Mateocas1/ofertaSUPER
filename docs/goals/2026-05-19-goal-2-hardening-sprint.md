# Goal 2 - Hardening sprint de ofertasSUPER basado en auditoría

> Uso recomendado: CLI con `effort=high`; usar `xhigh` solo para revisión adversarial final o bugs complejos. Depende de Goal 1.

```text
/goal Implementar un hardening sprint de ofertasSUPER basado únicamente en los hallazgos priorizados del Goal 1, con TDD cuando cambie lógica, commits por unidad de trabajo y evidencia before/after para mejorar calidad real y valor laboral.

Contexto:
- Proyecto principal: C:\Users\picala\Documents\ofertasSUPER.
- Este goal NO empieza si no existe una auditoría Goal 1 reciente en `docs/reports/engineering-audit/`.
- Estado objetivo: elevar ofertasSUPER de portfolio/laboral-ready a un proyecto técnicamente más sólido y defendible.
- Objetivo laboral: generar mejoras reales que se puedan explicar en entrevista, README, case study y LinkedIn sin vender humo.

Objetivo:
Tomar los P0/P1 de la auditoría y convertirlos en mejoras reales, testeadas, documentadas y commiteadas en work units revisables.

Contrato estricto:
- No implementar nada que no esté vinculado a un hallazgo del Goal 1, salvo aprobación explícita.
- No features nuevas por ansiedad.
- No refactor cosmético si no reduce riesgo, mejora mantenibilidad o aumenta evidencia laboral.
- No correr build local.
- No tocar dashboards externos sin aprobación.
- No reactivar schedules sin secrets/cadence/guards verificados.
- Tests junto al código relacionado.
- Conventional commits sin Co-Authored-By ni atribución AI.
- Si falla un test o smoke: usar debugging sistemático, no parches al azar.
- Guardar en Engram bugfixes, decisiones y descubrimientos no obvios.

Arquitectura de implementación:
Trabajar por slices verticales pequeñas:
1. Un problema concreto.
2. Un contrato/test que lo prueba.
3. Fix mínimo y limpio.
4. Verificación local/acotada.
5. Documentación si cambia claim, operación o comportamiento público.
6. Commit convencional.

Prioridad sugerida:
1. P0 seguridad/runtime/datos/demo rota.
2. P0 tests que cubren riesgos reales.
3. P1 clean code con impacto claro.
4. P1 performance/race conditions observables.
5. P1 docs/case-study evidence.
6. P2 solo si queda tiempo y no distrae del objetivo laboral.

TDD / testing:
- Si se cambia lógica: escribir test primero cuando sea viable.
- Si es bug: reproducir o crear test que falle antes del fix.
- Si no es viable TDD: justificar por qué y usar smoke/inspection alternativo.
- Ejecutar el test específico antes del suite completo.
- Verificación mínima por slice: test específico + `npm test` si aplica.
- Verificación final: `npm test`, `npm run typecheck`, `npm run lint`, smoke público/local acotado si cambian rutas.

Gates:

Gate 0 - Preflight:
- Confirmar repo, branch, remote y git status.
- Confirmar que existe Goal 1 audit y backlog.
- Elegir solo la primera tanda de P0/P1; no abrir todo a la vez.
- Estado requerido: GREEN.

Gate 1 - Slice selection:
- Seleccionar una unidad de trabajo que pueda revisarse sola.
- Documentar por qué esta slice aumenta calidad y chances laborales.
- Definir test gate antes de tocar código.

Gate 2 - Red/diagnóstico:
- Crear test que falle o evidencia clara del problema.
- Si no se puede reproducir, no implementar; documentar como investigación pendiente.

Gate 3 - Implementación mínima:
- Hacer el cambio más chico que cierre el problema.
- Mantener APIs y UI estables salvo que el hallazgo exija lo contrario.
- No mezclar refactor no relacionado.

Gate 4 - Verificación:
- Test específico verde.
- `npm test` según impacto.
- `npm run typecheck` si tocó TS/tipos/API.
- `npm run lint` antes de commit.
- Smoke acotado si tocó rutas públicas.

Gate 5 - Documentación y commit:
- Actualizar docs/handoff, README o reportes solo si cambia evidencia o claim.
- Commit convencional por work unit.
- El commit debe ser revertible sin romper cambios no relacionados.

Gate 6 - Auditoría final del sprint:
- Crear reporte final del sprint con before/after.
- Mapear hallazgo -> commit -> test -> claim laboral.
- No cerrar si queda working tree sucio.

Output obligatorio:
- Commits convencionales por slice.
- `docs/reports/hardening/YYYY-MM-DD-ofertassuper-hardening-sprint.md`
- `docs/reports/hardening/YYYY-MM-DD-ofertassuper-before-after.md`
- Si aplica: actualización de README/case study con claims seguros.

Criterio de éxito:
- P0 seleccionados cerrados o explícitamente diferidos con razón.
- P1 de mayor valor laboral cerrados si el tiempo alcanza.
- Tests/lint/typecheck verdes.
- No build local.
- Working tree limpio.
- Mejoras explicables en entrevista con evidencia exacta.
```
