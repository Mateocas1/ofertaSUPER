#!/usr/bin/env bash
# Disposable U15 PostgreSQL proof; the U11b4 fixture owns the labelled container and EXIT cleanup trap.
set -euo pipefail
# Add a loopback-only port to the unchanged U11b4 fixture invocation for Prisma's host process.
docker() {
  if [[ "$1" == run ]]; then
    shift
    command docker run -p 127.0.0.1::5432 "$@"
  else
    command docker "$@"
  fi
}
source scripts/test-existing-live-adoption-postgres.sh
# The U11b4 source finishes its g>0 clone; return to its retained g0 database for this proof.
database="${database%_g1}"

publisher_id="$(run "SELECT id FROM public.existing_live_adoptions WHERE request_key='g0'")"
lineage="sha256:$(printf 'c%.0s' {1..64})"; policy="sha256:$(printf 'a%.0s' {1..64})"; build="sha256:$(printf 'b%.0s' {1..64})"
run "
  SET SESSION AUTHORIZATION ofertasuper_authority;
  SELECT public.adopt_generation(jsonb_build_object(
    'key','u15-reader-g0','readerId','deployment','existingLiveAdoptionId','$publisher_id',
    'expectedGeneration','0','expectedLineage','$lineage','expectedPolicyDigest','$policy',
    'expectedHealthVersion','0','expectedBuildDigest','$build','surface','catalog'));
"
run "
  INSERT INTO public.catalog_operations VALUES
    ('g0','promote_delta','g0','{}','g0','PROMOTED'),
    ('g1','promote_delta','g1','{}','g1','PROMOTED');
  INSERT INTO public.serving_products(ean,name,brand,content_digest,last_operation_id)
  VALUES ('7790000000001','Snapshot product','Proof','digest-g0','g0');
  INSERT INTO public.serving_supermarkets(id,name,slug,base_url,is_vtex,is_active,freshness_sla_hours,content_digest,last_operation_id)
  VALUES (1,'One','one','https://one.test',false,true,1,'digest-g0','g0'),
         (2,'Two','two','https://two.test',false,true,1,'digest-g0','g0');
  INSERT INTO public.serving_offers(product_ean,supermarket_id,price,is_available,last_checked_at,content_digest,last_operation_id)
  VALUES ('7790000000001',1,100,true,clock_timestamp(),'digest-g0','g0'),
         ('7790000000001',2,120,true,clock_timestamp(),'digest-g0','g0');
  INSERT INTO public.serving_history(id,product_ean,supermarket_id,price,scraped_at,content_digest,last_operation_id)
  VALUES (1,'7790000000001',1,90,clock_timestamp(),'digest-g0','g0');
"
port="$(docker port "$container" 5432/tcp | head -n1 | awk -F: '{print $2}')"
url="postgresql://postgres@127.0.0.1:${port}/${database}?schema=public"
identity="$(printf '{\"version\":1,\"target\":\"production\",\"publicationId\":\"publication\",\"deploymentId\":\"deployment\",\"commitSha\":\"%s\",\"candidateDigest\":\"sha256:%s\"}' "$(printf '1%.0s' {1..40})" "$(printf 'f%.0s' {1..64})")"
PUBLIC_CATALOG_GUARDED_READ_POSTGRES_URL="$url" \
PUBLIC_CATALOG_SERVING_IDENTITY_JSON="$identity" \
npx tsx --conditions=react-server --test tests/public-catalog-read-postgres.test.ts
echo "U15 disposable guarded-read PostgreSQL snapshot proof passed; inherited EXIT trap removes ${container}."
