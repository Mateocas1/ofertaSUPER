#!/usr/bin/env bash
# Disposable U11b4 proof: one labelled container/database, migrations, lifecycle assertions, guaranteed cleanup.
set -euo pipefail

suffix="${RANDOM}${RANDOM}"
container="os03-u11b4-${suffix}"
database="u11b4_${suffix}"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is unavailable; U11b4 PostgreSQL proof was not run." >&2
  exit 125
fi
docker run --rm -d --name "$container" --label os03.u11b4.disposable=true -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
for _ in $(seq 1 60); do docker exec "$container" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec "$container" pg_isready -U postgres >/dev/null
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c "CREATE ROLE ofertasuper_authority; CREATE ROLE ofertasuper_verifier; CREATE ROLE ofertasuper_verifier_definer; CREATE ROLE ofertasuper_app; CREATE ROLE ofertasuper_runtime" >/dev/null
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c "CREATE DATABASE ${database}" >/dev/null

psql_db() { docker exec -i "$container" psql -XAt -v ON_ERROR_STOP=1 -U postgres -d "$1"; }
run() { psql_db "$database" <<<"$1"; }
expect_failure() {
  local expected="$1" statement="$2" output status
  set +e; output="$(psql_db "$database" <<<"$statement" 2>&1)"; status=$?; set -e
  if [[ $status -eq 0 || ! "$output" =~ $expected ]]; then
    printf 'expected failure /%s/, got (%s): %s\n' "$expected" "$status" "$output" >&2
    exit 1
  fi
}
adopt() {
  local key="$1" generation="$2" lineage="$3" health="$4" build="$5" policy="$6"
  run "SET SESSION AUTHORIZATION ofertasuper_authority; SELECT public.adopt_existing_live(jsonb_build_object('key','$key','publicationId','publication','expectedGeneration','$generation','expectedLineage','$lineage','expectedHealthVersion','$health','expectedBuildDigest','$build','expectedPolicyDigest','$policy'));"
}

# Apply the repository migration chain in lexical order to the isolated database.
while IFS= read -r migration; do docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$database" < "$migration" >/dev/null; done < <(find prisma/migrations -mindepth 2 -maxdepth 2 -name migration.sql -print | sort)

# Seed only immutable, independently selected database facts. No publisher request payload is stored.
run "
INSERT INTO public.refresh_policies VALUES ('policy','refresh-policy/v1','{}','sha256:'||repeat('a',64));
INSERT INTO public.baseline_manifests (id,canonical_bytes,digest,build_epoch,root_digest,snapshot_digest,evidence_digest,coverage_bytes,watermarks_bytes,provenance_bytes,custody_refs_bytes)
 VALUES ('baseline','{}','sha256:'||repeat('b',64),0,'sha256:'||repeat('c',64),'sha256:'||repeat('d',64),'sha256:'||repeat('e',64),'{}','{}','{}','[]');
INSERT INTO public.authority_candidates (id,manifest_bytes,manifest_digest,version,release_id,deployment_id,full_sha,domain,target,scope,valid_from,expires_at,policy_id,baseline_manifest_id)
 VALUES ('candidate','{}','sha256:'||repeat('f',64),'authority-candidate/v1','release','deployment',repeat('1',40),'example.test','production','catalog',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour','policy','baseline');
INSERT INTO public.candidate_technical_verifications (id,candidate_id,verifier_id,verifier_class,result,evidence_bytes,evidence_digest,verified_at,deadline_at)
 VALUES ('technical','candidate','verifier','independent','PASS','{}','sha256:'||repeat('1',64),clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour');
INSERT INTO public.production_readiness_promotions (id,candidate_digest,deployment_id,commit_sha,owner,rollback_authority,expires_at,state,updated_at)
 VALUES ('promotion','sha256:'||repeat('f',64),'deployment',repeat('1',40),'owner','owner',clock_timestamp()+interval '1 hour','PROMOTED',clock_timestamp());
INSERT INTO public.production_readiness_publications (id,promotion_id,target,state,verified_at) VALUES ('publication','promotion','production','PROMOTED',clock_timestamp());
INSERT INTO public.authority_lifecycle_reservations VALUES ('reservation','{\"publicationId\":\"publication\"}',0,'sha256:'||repeat('2',64),'receipt');
INSERT INTO public.approval_receipts (idempotency_key,request_digest,actor_id,approved_at,grant_expires_at,candidate_admission_id,candidate_verification_id,reviewed_payload_bytes,reviewed_payload_digest)
 VALUES ('approval','sha256:'||repeat('3',64),'owner',clock_timestamp(),clock_timestamp()+interval '1 hour','candidate','technical','{}','sha256:'||repeat('4',64));
INSERT INTO public.governed_catalogs (id,state,governed_generation,authority_adoption) VALUES
 ('catalog','LIVE',0,jsonb_build_object('incarnation','00000000-0000-4000-8000-000000000001','generation','0','lineage','sha256:'||repeat('c',64),'policyDigest','sha256:'||repeat('a',64),'buildDigest','sha256:'||repeat('b',64),'healthVersion','0'));
INSERT INTO public.authority_lifecycle_outcomes (operation_id,request,reservation_id,approval_id,verification_id,publication_id,final_checked_at,expires_at,proof)
 VALUES ('authority','{}','reservation','approval','technical','publication',clock_timestamp(),clock_timestamp()+interval '1 hour',jsonb_build_object('adoption',jsonb_build_object('incarnation','00000000-0000-4000-8000-000000000001','generation','0','lineage','sha256:'||repeat('c',64),'policyDigest','sha256:'||repeat('a',64),'buildDigest','sha256:'||repeat('b',64),'healthVersion','0')));
"

lineage="sha256:$(printf 'c%.0s' {1..64})"; policy="sha256:$(printf 'a%.0s' {1..64})"; build="sha256:$(printf 'b%.0s' {1..64})"
# g0 success, exact retry, and every request/adoption drift dimension.
[[ "$(adopt g0 0 "$lineage" 0 "$build" "$policy")" == "SET
g0" ]]
[[ "$(adopt g0 0 "$lineage" 0 "$build" "$policy")" == "SET
g0" ]]
expect_failure 'idempotency conflict' "SET SESSION AUTHORIZATION ofertasuper_authority; SELECT public.adopt_existing_live(jsonb_build_object('key','g0','publicationId','publication','expectedGeneration','0','expectedLineage','$lineage','expectedHealthVersion','0','expectedBuildDigest','sha256:'||repeat('9',64),'expectedPolicyDigest','$policy'));"
expect_failure 'stale existing LIVE generation binding' "SET SESSION AUTHORIZATION ofertasuper_authority; SELECT public.adopt_existing_live(jsonb_build_object('key','g0-generation','publicationId','publication','expectedGeneration','1','expectedLineage','$lineage','expectedHealthVersion','0','expectedBuildDigest','$build','expectedPolicyDigest','$policy'));"
expect_failure 'unverified existing LIVE baseline proof' "SET SESSION AUTHORIZATION ofertasuper_authority; SELECT public.adopt_existing_live(jsonb_build_object('key','g0-lineage','publicationId','publication','expectedGeneration','0','expectedLineage','sha256:'||repeat('9',64),'expectedHealthVersion','0','expectedBuildDigest','$build','expectedPolicyDigest','$policy'));"
expect_failure 'existing LIVE policy binding required' "SET SESSION AUTHORIZATION ofertasuper_authority; SELECT public.adopt_existing_live(jsonb_build_object('key','g0-policy','publicationId','publication','expectedGeneration','0','expectedLineage','$lineage','expectedHealthVersion','0','expectedBuildDigest','$build','expectedPolicyDigest','sha256:'||repeat('9',64)));"
for field in healthVersion buildDigest policyDigest; do
  value="'1'"; [[ "$field" == buildDigest || "$field" == policyDigest ]] && value="'sha256:'||repeat('9',64)"
  expect_failure 'existing LIVE adoption drift conflict' "BEGIN; SELECT set_config('governed_catalog.procedure','activate_authority',true); UPDATE public.governed_catalogs SET authority_adoption=jsonb_set(authority_adoption,'{$field}',to_jsonb($value::text)); SET SESSION AUTHORIZATION ofertasuper_authority; SELECT public.adopt_existing_live(jsonb_build_object('key','g0-drift-$field','publicationId','publication','expectedGeneration','0','expectedLineage','$lineage','expectedHealthVersion','0','expectedBuildDigest','$build','expectedPolicyDigest','$policy')); COMMIT;"
done

# g>0 independently selects a generation record and its immutable promotion outcome.
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c "CREATE DATABASE ${database}_g1 TEMPLATE ${database}" >/dev/null
database="${database}_g1"
run "
INSERT INTO public.verifier_envelope_commitments (id,envelope_bytes,envelope_digest,authenticated_verifier) VALUES ('00000000-0000-4000-8000-000000000010','{}','sha256:'||repeat('5',64),'ofertasuper_verifier');
INSERT INTO public.promotion_ready_envelope_admissions (id,commitment_id,request_key,request_digest,envelope_bytes,envelope_digest,payload,candidate_digest,delta_digest,incarnation,policy_digest,build_digest,health_version,predecessor_generation,predecessor_lineage,evidence_digest,observed_at,verified_at,authenticated_verifier)
 VALUES ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000010','admission','sha256:'||repeat('6',64),'{}','sha256:'||repeat('7',64),'{}','sha256:'||repeat('f',64),'sha256:'||repeat('8',64),'00000000-0000-4000-8000-000000000001','sha256:'||repeat('a',64),'sha256:'||repeat('b',64),0,0,'sha256:'||repeat('c',64),'sha256:'||repeat('9',64),clock_timestamp(),clock_timestamp(),'ofertasuper_verifier');
INSERT INTO public.sealed_generation_manifests (id,admission_id,publication_id,manifest_bytes,manifest_digest) VALUES ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000011','publication','{}','sha256:'||repeat('0',64));
INSERT INTO public.governed_generation_records (id,manifest_id,incarnation,generation,predecessor_generation,predecessor_lineage,result_lineage,policy_digest,build_digest,health_version,evidence_digest,audit_digest)
 VALUES ('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001',1,0,'sha256:'||repeat('c',64),'sha256:'||repeat('d',64),'sha256:'||repeat('a',64),'sha256:'||repeat('b',64),0,'sha256:'||repeat('e',64),'sha256:'||repeat('f',64));
INSERT INTO public.generation_promotion_operations (id,request_key,request_digest,generation_record_id,outcome) VALUES ('00000000-0000-4000-8000-000000000014','g1-op','sha256:'||repeat('1',64),'00000000-0000-4000-8000-000000000013',jsonb_build_object('generation','1','lineage','sha256:'||repeat('d',64),'expiresAt',(clock_timestamp()+interval '1 hour')::text));
SELECT set_config('governed_catalog.procedure','activate_authority',false); UPDATE public.governed_catalogs SET governed_generation=1, authority_adoption=jsonb_build_object('incarnation','00000000-0000-4000-8000-000000000001','generation','1','lineage','sha256:'||repeat('d',64),'policyDigest','sha256:'||repeat('a',64),'buildDigest','sha256:'||repeat('b',64),'healthVersion','0');
"
g1lineage="sha256:$(printf 'd%.0s' {1..64})"
[[ "$(adopt g1 1 "$g1lineage" 0 "$build" "$policy")" == "SET
g1" ]]
for field in lineage healthVersion buildDigest policyDigest; do
  value="'sha256:'||repeat('9',64)"; [[ "$field" == healthVersion ]] && value="'1'"
  expect_failure 'existing LIVE adoption drift conflict' "BEGIN; SELECT set_config('governed_catalog.procedure','activate_authority',true); UPDATE public.governed_catalogs SET authority_adoption=jsonb_set(authority_adoption,'{$field}',to_jsonb($value::text)); SET SESSION AUTHORIZATION ofertasuper_authority; SELECT public.adopt_existing_live(jsonb_build_object('key','g1-drift-$field','publicationId','publication','expectedGeneration','1','expectedLineage','$g1lineage','expectedHealthVersion','0','expectedBuildDigest','$build','expectedPolicyDigest','$policy')); COMMIT;"
done

# A separate late clone proves expiry denial cannot revive or insert an adoption.
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c "CREATE DATABASE ${database}_late TEMPLATE ${database}" >/dev/null
database="${database}_late"
run "
INSERT INTO public.authority_candidates (id,manifest_bytes,manifest_digest,version,release_id,deployment_id,full_sha,domain,target,scope,valid_from,expires_at,policy_id,baseline_manifest_id)
 VALUES ('candidate-late','{}','sha256:'||repeat('7',64),'authority-candidate/v1','release-late','deployment-late',repeat('2',40),'example.test','production','catalog',clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 second','policy','baseline');
INSERT INTO public.production_readiness_promotions (id,candidate_digest,deployment_id,commit_sha,owner,rollback_authority,expires_at,state,updated_at)
 VALUES ('promotion-late','sha256:'||repeat('7',64),'deployment-late',repeat('2',40),'owner','owner',clock_timestamp()+interval '1 hour','PROMOTED',clock_timestamp());
INSERT INTO public.production_readiness_publications (id,promotion_id,target,state,verified_at) VALUES ('publication-late','promotion-late','production','PROMOTED',clock_timestamp());
INSERT INTO public.authority_lifecycle_reservations VALUES ('reservation-late','{\"publicationId\":\"publication-late\"}',0,'sha256:'||repeat('2',64),'receipt');
INSERT INTO public.approval_receipts (idempotency_key,request_digest,actor_id,approved_at,grant_expires_at,candidate_admission_id,candidate_verification_id,reviewed_payload_bytes,reviewed_payload_digest)
 VALUES ('approval-late','sha256:'||repeat('3',64),'owner',clock_timestamp(),clock_timestamp()+interval '1 hour','candidate','technical','{}','sha256:'||repeat('4',64));
INSERT INTO public.authority_lifecycle_outcomes (operation_id,request,reservation_id,approval_id,verification_id,publication_id,final_checked_at,expires_at,proof)
 VALUES ('authority-late','{}','reservation-late','approval-late','technical','publication-late',clock_timestamp(),clock_timestamp()+interval '1 hour',jsonb_build_object('adoption',jsonb_build_object('incarnation','00000000-0000-4000-8000-000000000001','generation','0','lineage','$lineage','policyDigest','$policy','buildDigest','$build','healthVersion','0')));
SELECT set_config('governed_catalog.procedure','activate_authority',false); UPDATE public.governed_catalogs SET governed_generation=0, authority_adoption=jsonb_build_object('incarnation','00000000-0000-4000-8000-000000000001','generation','0','lineage','$lineage','policyDigest','$policy','buildDigest','$build','healthVersion','0');
"
expect_failure 'late-ineligible existing LIVE adoption requires forward recovery' "SET SESSION AUTHORIZATION ofertasuper_authority; SELECT public.adopt_existing_live(jsonb_build_object('key','late','publicationId','publication-late','expectedGeneration','0','expectedLineage','$lineage','expectedHealthVersion','0','expectedBuildDigest','$build','expectedPolicyDigest','$policy'));"
[[ "$(run "SELECT count(*) FROM public.existing_live_adoptions WHERE request_key='late'")" == "0" ]]

echo "U11b4 disposable g0/g>0 lifecycle, drift, retry, and late-ineligible proof passed; cleanup trap will remove ${container}."
