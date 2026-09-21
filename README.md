# ofertasSUPER

Comparador de precios de supermercados de Argentina. El objetivo de producto es permitir buscar un producto real, comparar su precio y disponibilidad observada, armar una canasta local y ampliar progresivamente la cobertura hasta un catálogo público casi completo por supermercado y contexto soportado.

## Estado actual

Corte documental: **2026-09-21**, código auditado en [`f8d8f4e`](https://github.com/Mateocas1/ofertaSUPER/commit/f8d8f4eccf82dfbd35f0c152b42bdb0379747b15).

| Etapa | Estado y alcance |
|---|---|
| CMVP-01/02 | Plan e integración de la línea de trabajo completados. La antigua reconciliación de ramas es evidencia histórica. |
| CMVP-03 | Adquisición inicial completada: base local con 537 productos y 728 ofertas; cohorte congelada de 500 productos, 691 ofertas y 167 productos presentes en al menos dos fuentes. Son mediciones fechadas, no cobertura total ni frescura actual. |
| CMVP-04 | Pendiente de implementación. Integra los hallazgos aplicables de la auditoría en ocho tareas: verificación, dependencias, datos, lectura pública, interfaz, canasta, operación y cierre. |
| CMVP-05 | Piloto pendiente. Sólo empieza al cumplir G04 con evidencia del candidato publicado. |
| Expansión | Profundizar las tres fuentes, medir cobertura casi completa y después incorporar nuevas fuentes según valor y capacidad de actualización. |

El alcance inicial comprende **Disco, Jumbo y Carrefour**. La cohorte de 500–1.000 productos valida el recorrido y la actualización; no limita la ambición de catálogo. La comparación exacta usa EAN/GTIN válido. Disponibilidad observada no equivale a stock garantizado al comprar.

## Por dónde continuar

- **[Ledger ODD: tareas, dependencias, aceptación y siguiente paso](odd/tasks/consumer-mvp-reset.md)**. Es la única fuente ejecutable de estado. Próxima tarea: **CMVP-04-T01**.
- **[Roadmap de producto y cobertura de catálogo](docs/consumer-mvp-roadmap.md)**. Define objetivos y denominadores; no duplica el seguimiento de tareas.
- **[Auditoría técnica y de producto del 2026-09-21](docs/reports/engineering-audit/2026-09-21-consumer-mvp-audit.md)**. Conserva hallazgos, pruebas y limitaciones del corte auditado.
- **[Contrato de orquestación ODD / Gentle Shell](odd/orchestration/consumer-mvp-herdr.md)**. Paquetes de trabajo para el orquestador GPT 5.6 Sol, trabajadores y verificación independiente.
- **[Bloqueos observados](odd/blockers/consumer-mvp-blockers.md)**. Distingue impedimentos actuales de incidentes ya resueltos.

## Arquitectura y recorrido

La arquitectura aceptada para el consumidor es **PostgreSQL local para adquisición/procesamiento → snapshot inmutable validado → lector público Next.js/Vercel**. CMVP-03 generó evidencia de adquisición y snapshots. La integración completa de ese contrato con las rutas públicas sigue pendiente en CMVP-04; no debe inferirse de la existencia del exportador.

El código contiene búsqueda, detalle por EAN, categorías, ofertas, canasta local, adaptadores VTEX, validación/reconciliación y administración protegida. CMVP-04 debe simplificar las rutas de lectura y mecanismos heredados que afecten el recorrido público. Se conserva Supabase sólo como recuperación/exportación temporal según el ledger; no se añade otra base administrada.

| Área | Entrada al código |
|---|---|
| Web | `src/app/page.tsx`, `src/app/buscar/`, `src/app/producto/[ean]/`, `src/app/canasta/`, `src/app/ofertas/`, `src/app/categoria/[slug]/` |
| APIs | `src/app/api/search/`, `src/app/api/products/`, `src/app/api/categories/`, `src/app/api/promotions/` |
| Catálogo y políticas | `src/lib/catalog.ts`, `src/lib/public-catalog-api.ts`, `src/lib/public-catalog-readiness.ts`, `src/lib/portfolio-catalog.ts` |
| Adquisición y validación | `src/lib/vtex/`, `src/lib/ingestion/`, `scripts/pipeline/` |
| Persistencia | `prisma/schema.prisma`, `prisma/migrations/` |
| Administración | `src/proxy.ts`, `src/lib/admin/`, `src/app/admin/`, `src/app/api/admin/` |

Stack: Next.js App Router, React, TypeScript, Tailwind CSS, Prisma/PostgreSQL y Clerk para administración. Las versiones efectivas están en [package.json](package.json) y su lockfile. CMVP-04-T02 incluye la corrección y verificación de dependencias observadas por la auditoría.

## Sitio público y evidencia

Alias: [ofertas-super.vercel.app](https://ofertas-super.vercel.app). La auditoría del 2026-09-21 observó búsqueda degradada con datos de ejemplo antiguos y no pudo vincular ese despliegue a un SHA. La existencia de la URL no acredita el recorrido real ni el piloto. CMVP-04 exige enlazar commit, versión del catálogo, fechas y pruebas del alias.

El contrato objetivo muestra datos frescos, distingue históricos y devuelve indisponibilidad cuando no hay publicación válida. Los ejemplos ilustrativos deben identificarse y no simular resultados o acciones de catálogo. La verdad del dato, las cantidades de canasta y la actualización diaria son condiciones de cierre.

Los [reportes de producción anteriores](docs/reports/production-readiness/), el [cierre de portfolio](docs/reports/portfolio-readiness/2026-08-13-functional-mvp-closure.md) y [goal.md](goal.md) preservan objetivos y evidencias de etapas anteriores. Sus próximos pasos no sustituyen el ledger actual. CMVP-04-T08 reconcilia las condiciones heredadas que sigan siendo aplicables; cerrar una issue intermedia no demuestra cumplimiento del producto.

## Desarrollo y verificación

Consultar [AGENTS.md](AGENTS.md), [package.json](package.json) y el [contrato de runtime](docs/portable-runtime-contract.md) antes de ejecutar. Ese contrato describe las herramientas existentes; CMVP-04 actualizará las instrucciones que dependan del lector heredado. Configurar valores de desarrollo mediante `.env.example`, sin versionar credenciales. Las operaciones sobre fuentes, bases o despliegues requieren el alcance y destino correspondientes; la autorización ya otorgada sigue vigente para el trabajo que cubra.

Comandos existentes de referencia:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

**Limitación auditada:** el descubrimiento de `npm test` omite archivos de primer nivel en el entorno Linux inspeccionado. CMVP-04-T01 debe corregirlo y demostrar el conjunto completo ejecutado antes de usar un resultado verde como aceptación. El ledger contiene el runner observado, los fallos clasificados y la verificación requerida. Los cambios de comportamiento mantienen el TDD estricto configurado; la documentación se revisa mediante contenido, enlaces y diff.
