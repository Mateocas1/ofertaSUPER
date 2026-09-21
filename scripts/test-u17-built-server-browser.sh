#!/usr/bin/env bash
# U17 extends the U16 disposable PostgreSQL authority fixture and leaves its EXIT trap in charge of PostgreSQL cleanup.
set -euo pipefail

if [[ ! -f .next/BUILD_ID ]]; then
  echo "Built Next output is required (.next/BUILD_ID missing); run the repository build before this disposable PostgreSQL/browser smoke." >&2
  exit 2
fi

U16_FIXTURE_ONLY=1 source scripts/test-u16-built-server-postgres.sh

PUBLIC_CATALOG_GUARDED_READ_POSTGRES_URL="$url" \
PUBLIC_CATALOG_SERVING_IDENTITY_JSON="$identity" \
npx tsx --conditions=react-server scripts/u17-built-server-browser-smoke.ts
