#!/usr/bin/env bash
# Disposable U14b lifecycle proof reuses the labelled U11b4 fixture and its EXIT cleanup trap.
set -euo pipefail
source scripts/test-existing-live-adoption-postgres.sh

digest() { printf 'sha256:'; printf "$1%.0s" {1..64}; }
policy="$(digest a)"; build="$(digest b)"; bad_lineage="$(digest d)"
run "SELECT set_config('governed_catalog.procedure','activate_authority',false); UPDATE public.governed_catalogs SET governed_generation=1,authority_adoption=jsonb_build_object('incarnation','00000000-0000-4000-8000-000000000001','generation','1','lineage','$bad_lineage','policyDigest','$policy','buildDigest','$build','healthVersion','0'); INSERT INTO public.catalog_operations VALUES ('g1-op','promote_delta','g1-op','{}','g1-op','PROMOTED'); INSERT INTO public.serving_products(ean,name,brand,content_digest,last_operation_id) VALUES ('12345678','bad','unrelated','old','g1-op'),('87654321','other','kept','old','g1-op');"
seed_admission() {
  local n="$1" predecessor="$2" lineage="$3" sku="$4" name="$5" brand="$6" letter="${1:0:1}"
  run "INSERT INTO public.verifier_envelope_commitments(id,envelope_bytes,envelope_digest,authenticated_verifier) VALUES ('00000000-0000-4000-8000-000000000${n}0','{}','$(digest "$letter")','ofertasuper_verifier');
  INSERT INTO public.promotion_ready_envelope_admissions(id,commitment_id,request_key,request_digest,envelope_bytes,envelope_digest,payload,candidate_digest,delta_digest,incarnation,policy_digest,build_digest,health_version,predecessor_generation,predecessor_lineage,evidence_digest,observed_at,verified_at,authenticated_verifier) VALUES ('00000000-0000-4000-8000-000000000${n}1','00000000-0000-4000-8000-000000000${n}0','fresh-$n','$(digest "$letter")','{}','$(digest "$letter")','{}','$(digest f)','$(digest "$letter")','00000000-0000-4000-8000-000000000001','$policy','$build',0,$predecessor,'$lineage','$(digest e)',clock_timestamp(),clock_timestamp(),'ofertasuper_verifier');
  INSERT INTO public.sealed_generation_manifests(id,admission_id,publication_id,manifest_bytes,manifest_digest) VALUES ('00000000-0000-4000-8000-000000000${n}2','00000000-0000-4000-8000-000000000${n}1','publication','{}','$(digest "$letter")');
  INSERT INTO public.sealed_generation_delta_items VALUES ('00000000-0000-4000-8000-000000000${n}2','00000000-0000-4000-8000-000000000${n}1',0,'product','{\"ean\":\"$sku\"}','product:{\"ean\":\"$sku\"}',jsonb_build_object('ean','$sku','name','$name','brand','$brand','description',NULL,'imageUrl',NULL,'images','[]'::jsonb,'category',NULL),false);"
}
promote() { run "SET SESSION AUTHORIZATION ofertasuper_authority; SELECT public.promote_delta(jsonb_build_object('key','$1','manifestId','$2','expectedGeneration','$3','expectedHealthVersion','0'));"; }
seed_admission 20 1 "$bad_lineage" 87654321 successor kept
[[ "$(promote successor 00000000-0000-4000-8000-000000000202 1)" == $'SET\nsuccessor' ]]
lineage2="$(run "SELECT result_lineage FROM public.governed_generation_records WHERE generation=2")"
seed_admission 30 2 "$lineage2" 12345678 corrected unrelated
link="SELECT public.link_forward_correction(jsonb_build_object('key','correction','admissionId','00000000-0000-4000-8000-000000000301','envelopeDigest','$(digest 3)','badOperationId','00000000-0000-4000-8000-000000000014','badGenerationRecordId','00000000-0000-4000-8000-000000000013','expectedGeneration','2','expectedLineage','$lineage2'));"
[[ "$(run "SET SESSION AUTHORIZATION ofertasuper_authority; $link")" == *LINKED* ]]
[[ "$(promote correction 00000000-0000-4000-8000-000000000302 2)" == $'SET\ncorrection' ]]
[[ "$(run "SELECT governed_generation FROM public.governed_catalogs WHERE id='catalog'")" == "3" ]]
[[ "$(run "SELECT name||':'||brand||':'||last_operation_id FROM public.serving_products WHERE ean='12345678'")" == "corrected:unrelated:correction" ]]
[[ "$(run "SELECT bad_operation_id::text||':'||bad_generation_record_id::text||':'||audit_digest FROM public.forward_corrective_generation_links")" == 00000000-0000-4000-8000-000000000014:00000000-0000-4000-8000-000000000013:sha256:* ]]
[[ "$(run "SELECT count(*) FROM public.serving_products WHERE last_operation_id='g1-op'")" == "0" ]]
seed_admission 40 3 "$lineage2" 12345678 overlap unrelated
[[ "$(run "SET SESSION AUTHORIZATION ofertasuper_authority; SELECT public.link_forward_correction(jsonb_build_object('key','overlap','admissionId','00000000-0000-4000-8000-000000000401','envelopeDigest','$(digest 4)','badOperationId','00000000-0000-4000-8000-000000000014','badGenerationRecordId','00000000-0000-4000-8000-000000000013','expectedGeneration','3','expectedLineage','$lineage2'));")" == *RESTRICTED* ]]
[[ "$(run "SELECT count(*) FROM public.catalog_restriction_surfaces WHERE fact='commercial-data' AND surface='catalog'")" == "1" ]]
echo "U14b bad delta, unrelated successor, fresh g+1 correction, immutable linkage, retained overlap restriction passed; inherited EXIT trap removes ${container}."
