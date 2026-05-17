# Screenshot proof checklist

Screenshots in this repo are evidence artifacts. They must be tied to a dated report and must not imply production readiness by themselves.

## Fresh screenshots from current readiness goal

| Route | File | Evidence report | Use permitted |
|---|---|---|---|
| `/` | `docs/screenshots/readiness-public-home-2026-05-17.png` | Gate 5 | Public smoke / home proof |
| `/buscar?q=leche` | `docs/screenshots/readiness-public-search-2026-05-17.png` | Gate 5 | Public smoke / search proof |
| `/canasta` | `docs/screenshots/readiness-public-canasta-2026-05-17.png` | Gate 5 | Public smoke / basket shell proof |

## Rules

- Do not call screenshots production evidence unless deploy, secrets, DB, and admin gates are closed.
- If a screenshot depends on fallback/demo behavior, say so in the report or README.
- Keep sensitive data out of screenshots.
- Prefer date-stamped filenames and a matching report under `docs/reports/production-readiness/`.

## Future captures

| Priority | Route | Condition before capture |
|---|---|---|
| P1 | `/producto/[ean]` | EAN discovered from API or DB-backed search in the same run |
| P1 | `/categoria/[slug]` | Slug discovered from `/api/categories` in the same run |
| P2 | `/ofertas` | Promotions/discounts seeded or present |
| P2 | `/admin/promociones` | Authenticated admin session in a safe environment |
