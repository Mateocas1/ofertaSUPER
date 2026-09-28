# ofertasSUPER

Comparador de precios y ofertas de supermercados de Argentina (Carrefour, Disco y Jumbo) por EAN: buscás un producto, ves el precio y la oferta en cada súper, y armás un carrito que puede mezclar súpers.

## Cómo funciona

1. Un Postgres local (docker compose) guarda el catálogo: productos, ofertas por súper, historial de precios y promos.
2. `npm run refresh:catalog` (o el cron diario) lee las fuentes, captura ofertas y promos simples, y exporta `data/catalog-snapshot.json`: un **snapshot JSON versionado** que se commitea en el repo.
3. Vercel sirve ese snapshot: todas las páginas y APIs públicas lo leen, sin base de datos en el camino de lectura. Si falta o está corrupto, el sitio muestra "no disponible", nunca datos demo.

## Comandos

```bash
npm run refresh:catalog   # actualizar catálogo + regenerar el snapshot
npm test                  # suite completa
npm run dev               # desarrollo local
```

- **Runbook** (actualización diaria, cron, respaldo y restauración de la base): [docs/v1-plan.md](docs/v1-plan.md#runbook)
- **Reporte de cierre v1**: [docs/reports/v1-closure.md](docs/reports/v1-closure.md)

## Limitaciones honestas

- Las promos simples son de Carrefour; Disco y Jumbo no exponen teasers por producto.
- Las promos bancarias y de fidelidad están fuera de v1.
- La frescura depende del refresh diario en esta máquina: el sitio siempre muestra el último snapshot commiteado, con su fecha de observación.

## Desarrollo

Requisitos: Node 22+, Docker (para la base local). Copiá `.env.example` a `.env.local` con tus valores; las credenciales locales del bootstrap viven en `~/.config/ofertasuper/postgres.env` (nunca se commitean).

```bash
npm ci
npx prisma generate
npm run dev
```

Admin: acceso con falla cerrada salvo que la sesión de Clerk tenga el claim exacto de rol admin (ver `docs/portable-runtime-contract.md`).
