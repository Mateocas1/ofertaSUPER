#!/usr/bin/env bash
# Disposable U13a A/B proof; the sourced U11b4 fixture owns the labelled container and EXIT cleanup trap.
set -euo pipefail
source scripts/test-existing-live-adoption-postgres.sh

publisher_id="$(run "SELECT id FROM public.existing_live_adoptions WHERE request_key='g0'")"
lineage="sha256:$(printf 'c%.0s' {1..64})"; policy="sha256:$(printf 'a%.0s' {1..64})"; build="sha256:$(printf 'b%.0s' {1..64})"
adopt_reader() {
  local key="$1" reader="$2"
  run "SET SESSION AUTHORIZATION ofertasuper_authority; SELECT public.adopt_generation(jsonb_build_object('key','$key','readerId','$reader','existingLiveAdoptionId','$publisher_id','expectedGeneration','0','expectedLineage','$lineage','expectedPolicyDigest','$policy','expectedHealthVersion','0','expectedBuildDigest','$build','surface','catalog'));"
}
expect_failure() {
  local expected="$1" statement="$2" output status
  set +e; output="$(psql_db "$database" <<<"$statement" 2>&1)"; status=$?; set -e
  [[ $status -ne 0 && "$output" =~ $expected ]] || { printf 'expected failure /%s/: %s\n' "$expected" "$output" >&2; exit 1; }
}
[[ "$(adopt_reader reader-a A)" == $'SET\nreader-a' ]]
[[ "$(adopt_reader reader-a A)" == $'SET\nreader-a' ]]
[[ "$(adopt_reader reader-b B)" == $'SET\nreader-b' ]]
expect_failure 'idempotency conflict' "SET SESSION AUTHORIZATION ofertasuper_authority; SELECT public.adopt_generation(jsonb_build_object('key','reader-a','readerId','A','existingLiveAdoptionId','$publisher_id','expectedGeneration','0','expectedLineage','$lineage','expectedPolicyDigest','sha256:'||repeat('9',64),'expectedHealthVersion','0','expectedBuildDigest','$build','surface','catalog'));"
expect_failure 'drift conflict' "SET SESSION AUTHORIZATION ofertasuper_authority; SELECT public.adopt_generation(jsonb_build_object('key','policy-drift','readerId','C','existingLiveAdoptionId','$publisher_id','expectedGeneration','0','expectedLineage','$lineage','expectedPolicyDigest','sha256:'||repeat('9',64),'expectedHealthVersion','0','expectedBuildDigest','$build','surface','catalog'));"
expect_failure 'drift conflict' "SET SESSION AUTHORIZATION ofertasuper_authority; SELECT public.adopt_generation(jsonb_build_object('key','drift','readerId','C','existingLiveAdoptionId','$publisher_id','expectedGeneration','0','expectedLineage','$lineage','expectedPolicyDigest','$policy','expectedHealthVersion','0','expectedBuildDigest','sha256:'||repeat('9',64),'surface','catalog'));"
run "INSERT INTO public.catalog_restriction_facts(fact,reason) VALUES ('commercial-data','test'); INSERT INTO public.catalog_restriction_surfaces VALUES ('commercial-data','catalog');"
expect_failure 'restricted reader surface' "SET SESSION AUTHORIZATION ofertasuper_authority; SELECT public.adopt_generation(jsonb_build_object('key','restricted','readerId','C','existingLiveAdoptionId','$publisher_id','expectedGeneration','0','expectedLineage','$lineage','expectedPolicyDigest','$policy','expectedHealthVersion','0','expectedBuildDigest','$build','surface','catalog'));"
run "
  DELETE FROM public.catalog_restriction_surfaces;
  DELETE FROM public.catalog_restriction_facts;
  INSERT INTO public.publication_grants VALUES ('revoke-grant','owner','authority-revoke','catalog','production','$policy',clock_timestamp()+interval '2 hours',NULL,clock_timestamp());
  ALTER TABLE public.authority_lifecycle_outcomes DISABLE TRIGGER authority_lifecycle_outcomes_immutable;
  UPDATE public.authority_lifecycle_outcomes SET proof=jsonb_build_object('candidate',jsonb_build_object('scope','catalog','target','production'),'adoption',proof->'adoption') WHERE operation_id='authority';
  ALTER TABLE public.authority_lifecycle_outcomes ENABLE TRIGGER authority_lifecycle_outcomes_immutable;
  INSERT INTO public.authority_revoke_challenges VALUES ('revoke-challenge','owner',repeat('a',64),repeat('b',64),repeat('c',64),
    public.authority_revoke_review('authority','race proof'),'revoke-grant',(SELECT expires_at FROM public.publication_grants WHERE id='revoke-grant'),clock_timestamp()+interval '1 hour');
  INSERT INTO public.authority_revoke_receipts VALUES ('revoke-consent','revoke-challenge','{}',clock_timestamp(),'{}');
  GRANT EXECUTE ON FUNCTION public.revoke_authority(JSONB) TO ofertasuper_authority;
  CREATE FUNCTION public.u13a_pause_reader_adoption() RETURNS TRIGGER LANGUAGE plpgsql AS \$\$
  BEGIN PERFORM pg_catalog.pg_sleep(3); RETURN NEW; END \$\$;
  CREATE TRIGGER u13a_pause_reader_adoption BEFORE INSERT ON public.reader_generation_adoptions
  FOR EACH ROW EXECUTE FUNCTION public.u13a_pause_reader_adoption();
"
revoke_authority() {
  run "SET SESSION AUTHORIZATION ofertasuper_authority; SELECT public.revoke_authority(jsonb_build_object('key','revoke-race','operationId','authority','reservationId','reservation','consentId','revoke-consent','expectedVersion',0,'actorId','owner','sessionHash',repeat('a',64)));"
}
adopt_reader reader-race Race >/dev/null 2>&1 &
reader_pid=$!
for _ in $(seq 1 30); do
  [[ "$(run "SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE wait_event='PgSleep'")" == "1" ]] && break
  sleep 0.1
done
[[ "$(run "SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE wait_event='PgSleep'")" == "1" ]] || { echo 'reader race did not reach deterministic insert pause' >&2; exit 1; }
[[ "$(revoke_authority)" == $'SET\nrevoke-race' ]]
if kill -0 "$reader_pid" 2>/dev/null; then
  echo 'reader adoption remained active after revoke_authority committed' >&2
  exit 1
fi
wait "$reader_pid"
[[ "$(run "SELECT count(*) FROM public.reader_generation_adoptions WHERE request_key='reader-race'")" == "1" ]]
expect_failure 'authority is revoked' "SET SESSION AUTHORIZATION ofertasuper_authority; SELECT public.adopt_generation(jsonb_build_object('key','revoked','readerId','C','existingLiveAdoptionId','$publisher_id','expectedGeneration','0','expectedLineage','$lineage','expectedPolicyDigest','$policy','expectedHealthVersion','0','expectedBuildDigest','$build','surface','catalog'));"
[[ "$(run "SELECT count(*) FROM public.reader_generation_adoptions WHERE request_key='revoked'")" == "0" ]]
echo "U13a disposable reader A/B, restriction, drift, serialized revoke/adoption race, and retry proof passed; inherited EXIT trap removes ${container}."
