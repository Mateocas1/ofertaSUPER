import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "prisma/migrations/20260905_promotion_ready_delta_admission/migration.sql";
const container = process.env.U11_PG_CONTAINER;
function sql(statement: string) {
  return execFileSync("docker", ["exec", "-i", container!, "psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "u11_admission"], {
    input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

function migration() {
  assert.equal(existsSync(migrationPath), true, "durable admission migration is required");
  return readFileSync(migrationPath, "utf8");
}

test("admits only a durable server-owned verifier commitment reference into immutable retained seals", () => {
  const sql = migration();
  assert.match(sql, /CREATE TABLE public\.promotion_ready_envelope_admissions/);
  assert.match(sql, /CREATE TABLE public\.promotion_ready_envelope_items/);
  assert.match(sql, /commitment_id UUID NOT NULL UNIQUE REFERENCES public\.verifier_envelope_commitments\(id\) ON DELETE RESTRICT/);
  assert.match(sql, /p_request \?& ARRAY\['commitmentId','requestKey'\]/);
  assert.match(sql, /SELECT \* INTO commitment FROM public\.verifier_envelope_commitments.*FOR UPDATE/);
  assert.match(sql, /UPDATE public\.verifier_envelope_commitments SET admission_id = admission\.id/);
  assert.match(sql, /FROM public\.authority_candidates c/);
  assert.match(sql, /JOIN public\.candidate_technical_verifications tv/);
  assert.match(sql, /JOIN public\.delta_verifications v/);
  assert.match(sql, /v\.result_digest = payload->'verifier'->>'resultDigest'/);
  assert.doesNotMatch(sql, /v\.result_digest = payload->'binding'->>'deltaDigest'/);
  assert.match(sql, /v\.committed_snapshot = payload->'verifier'->>'snapshot'/);
  assert.match(sql, /JOIN public\.evidence_artifacts e/);
  assert.match(sql, /stale commitment binding/);
  assert.match(sql, /before_image JSONB NOT NULL/);
  assert.match(sql, /prevent_promotion_ready_admission_mutation\(\)/);
  assert.doesNotMatch(sql, /commit_promotion_ready_envelope\(/);
  assert.doesNotMatch(sql, /promote_delta|UPDATE public\.governed_catalogs|INSERT INTO public\.serving_(?:products|offers|history)/i);
});

test("PostgreSQL rejects a forged verifier snapshot and exactly retries the retained admission", { skip: !container }, () => {
  execFileSync("docker", ["exec", container!, "createdb", "-U", "postgres", "-T", "u11_template", "u11_admission"]);
  const digest = (letter: string) => `'sha256:'||repeat('${letter}',64)`;
  sql(`INSERT INTO public.refresh_policies VALUES ('policy','refresh-policy/v1','{}',${digest("c")});
    INSERT INTO public.baseline_manifests (id,canonical_bytes,digest,build_epoch,root_digest,snapshot_digest,evidence_digest,coverage_bytes,watermarks_bytes,provenance_bytes,custody_refs_bytes) VALUES ('baseline','{}',${digest("d")},0,${digest("e")},${digest("f")},${digest("0")},'{}','{}','{}','[]');
    INSERT INTO public.authority_candidates (id,manifest_bytes,manifest_digest,version,release_id,deployment_id,full_sha,domain,target,scope,valid_from,expires_at,policy_id,baseline_manifest_id) VALUES ('candidate','{}',${digest("a")},'authority-candidate/v1','release','deployment',repeat('b',40),'example.test','production','catalog',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour','policy','baseline');
    INSERT INTO public.candidate_technical_verifications (id,candidate_id,verifier_id,verifier_class,result,evidence_bytes,evidence_digest,verified_at,deadline_at) VALUES ('technical','candidate','verifier','independent','PASS','{}',${digest("1")},clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour');
    INSERT INTO public.governed_catalogs (id,state,governed_generation,authority_adoption) VALUES ('catalog','LIVE',0,jsonb_build_object('verificationId','technical','incarnation','00000000-0000-4000-8000-000000000001','policyDigest',${digest("c")},'buildDigest',${digest("2")},'healthVersion','0','lineage',${digest("3")}));
    INSERT INTO public.source_capture_operations VALUES ('source','source-capture/v1:sha256:'||repeat('4',64),'vea','[]','2026-01-01T00:00:00.000Z');
    INSERT INTO public.evidence_artifacts VALUES ('evidence','proof',${digest("5")},'CLEAR',clock_timestamp()+interval '1 hour');
    INSERT INTO public.delta_verifications VALUES ('delta','source','verifier/read-only','committed:authoritative',${digest("c")},${digest("3")},${digest("b")},'evidence','2026-01-01T00:00:00.000Z','2026-01-01T00:01:00.000Z','SEALED_SOURCE_ONLY');`);
  const envelope = (snapshot: string, resultDigest = digest("b")) => `jsonb_build_object('version','promotion-ready-envelope/v1','binding',jsonb_build_object('candidateDigest',${digest("a")},'deltaDigest',${digest("6")},'incarnation','00000000-0000-4000-8000-000000000001','policyDigest',${digest("c")},'buildDigest',${digest("2")},'healthVersion','0','predecessorGeneration','0','predecessorLineage',${digest("3")}),'verifier',jsonb_build_object('snapshot','${snapshot}','resultDigest',${resultDigest}),'evidenceDigest',${digest("5")},'observedAt','2026-01-01T00:00:00.000Z','verifiedAt','2026-01-01T00:01:00.000Z','capture',jsonb_build_object('operationKey','source-capture/v1:sha256:'||repeat('4',64),'source','vea','items','[]'::jsonb,'observedAt','2026-01-01T00:00:00.000Z'),'items','[]'::jsonb)`;
  const commit = (name: string, snapshot: string, resultDigest = digest("b")) => `WITH payload AS (SELECT ${envelope(snapshot, resultDigest)} value) INSERT INTO public.verifier_envelope_commitments (envelope_bytes,envelope_digest,authenticated_verifier) SELECT convert_to(value::text,'UTF8'),'sha256:'||encode(sha256(convert_to(value::text,'UTF8')),'hex'),'ofertasuper_verifier' FROM payload RETURNING id`;
  const forged = sql(commit("forged", "committed:forged")).split("\n")[0];
  assert.throws(() => sql(`SET SESSION AUTHORIZATION ofertasuper_verifier; SELECT public.admit_promotion_ready_envelopes(jsonb_build_object('commitmentId','${forged}','requestKey','forged'));`), /stale commitment binding/);
  const mismatched = sql(commit("mismatched", "committed:authoritative", digest("7"))).split("\n")[0];
  assert.throws(() => sql(`SET SESSION AUTHORIZATION ofertasuper_verifier; SELECT public.admit_promotion_ready_envelopes(jsonb_build_object('commitmentId','${mismatched}','requestKey','mismatched'));`), /stale commitment binding/);
  const valid = sql(commit("valid", "committed:authoritative")).split("\n")[0];
  const result = sql(`SET SESSION AUTHORIZATION ofertasuper_verifier; SELECT public.admit_promotion_ready_envelopes(jsonb_build_object('commitmentId','${valid}','requestKey','exact-retry')); SELECT public.admit_promotion_ready_envelopes(jsonb_build_object('commitmentId','${valid}','requestKey','exact-retry'));`).split("\n");
  assert.equal(result.at(-1), result.at(-2));
  assert.equal(sql("SELECT count(*) FROM public.promotion_ready_envelope_admissions"), "1");
});
