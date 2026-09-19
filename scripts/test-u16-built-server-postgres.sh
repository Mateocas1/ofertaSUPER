#!/usr/bin/env bash
# U16 real-server proof reuses the U15 disposable authority fixture and its EXIT cleanup trap.
set -euo pipefail

if [[ ! -f .next/BUILD_ID && "${U16_FIXTURE_ONLY:-0}" != "1" ]]; then
  echo "Built Next output is required (.next/BUILD_ID missing); run the repository build before this disposable PostgreSQL smoke." >&2
  exit 2
fi

source scripts/test-guarded-read-snapshot-postgres.sh

# U15 supplies the eligible adoption and base serving facts. Add only the U16 route projections.
seedU16ServingFixture() {
  run "
    UPDATE public.serving_products SET category = 'Almacén' WHERE ean = '7790000000001';
    INSERT INTO public.serving_promotions(id,supermarket_id,type,title,discount_value,is_active,content_digest,last_operation_id)
    VALUES (1,1,'percentage','Snapshot promotion',20,true,'digest-g0','g0');
    INSERT INTO public.serving_memberships(promotion_id,product_ean,content_digest,last_operation_id)
    VALUES (1,'7790000000001','digest-g0','g0');
  "
}

seedU16ServingFixture

if [[ "${U16_FIXTURE_ONLY:-0}" != "1" ]]; then
  PUBLIC_CATALOG_GUARDED_READ_POSTGRES_URL="$url" \
  PUBLIC_CATALOG_SERVING_IDENTITY_JSON="$identity" \
  npx tsx --conditions=react-server scripts/u16-built-server-postgres-smoke.ts
fi
