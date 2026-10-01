# ofertasSUPER

Comparador de precios y ofertas de supermercados de Argentina (Carrefour, Disco y
Jumbo) por GTIN-14: buscás un producto, ves el precio y la oferta en cada súper,
y armás un carrito que puede mezclar súpers.

- **Sitio en vivo:** https://ofertasuper.com
- **Runbook operativo** (actualización diaria, cron, Postgres, backups): [docs/RUNBOOK.md](docs/RUNBOOK.md)
- **Arquitectura** (flujo de datos y módulos clave): [ARCHITECTURE.md](ARCHITECTURE.md)

## Cómo fluyen los datos

Los scrapers VTEX leen el catálogo de cada súper y lo escriben en tablas de
staging de un Postgres local; un reconcile transaccional con advisory lock
fusiona cada observación en el catálogo vivo (identidad GTIN-14 con checksum),
un gate de frescura decide qué precio es "actual", y el pipeline exporta
`data/catalog-snapshot.json`: un snapshot JSON versionado que se commitea en el
repo. Vercel sirve ese snapshot a la app Next.js y a las APIs públicas, sin base
de datos en el camino de lectura; si falta o está corrupto, el sitio muestra "no
disponible", nunca datos demo. Detalle en [ARCHITECTURE.md](ARCHITECTURE.md).

## Desarrollo local

Requisitos: Node 22+, Docker (para el Postgres local).

```bash
npm ci
npx prisma generate
cp .env.example .env.local   # valores locales; las credenciales del bootstrap viven en ~/.config/ofertasuper/postgres.env (nunca se commitean)
docker compose up -d postgres
npm run dev
```

Comandos útiles:

```bash
npm run refresh:catalog   # leer fuentes, actualizar el catálogo y regenerar el snapshot
npm test                  # suite completa
npm run lint              # ESLint
npm run typecheck         # tsc --noEmit
```

La actualización diaria en esta máquina corre por cron (`scripts/cron-refresh.sh`);
el comando exacto, los frenos y la restauración del Postgres están en
[docs/RUNBOOK.md](docs/RUNBOOK.md).

## Limitaciones honestas

- Las promos simples son de Carrefour; Disco y Jumbo no exponen teasers por producto.
- Las promos bancarias y de fidelidad están fuera de v1.
- La frescura depende del refresh diario: el sitio siempre muestra el último
  snapshot commiteado, con su fecha de observación.
- Admin: acceso con falla cerrada salvo que la sesión de Clerk tenga el claim exacto de rol admin.

## Documentación histórica

Los planes largos, los specs de governance y los reportes operativos previos
viven en el tag de git `archive/full-governance` (`664674d`). Este repo mantiene
solo los documentos cortos y el runbook vigente.
