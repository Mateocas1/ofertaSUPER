import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { createDeltaPromotionRepository, createDeltaRecoveryRepository, createGenerationPromotionFoundationRepository, createGenerationPromotionFoundationRequest, createSealedGenerationDeltaItems } from "@/lib/production-readiness/repository";

const migrationPath = "prisma/migrations/20260906_atomic_verified_delta_promotion/migration.sql";
const container = process.env.U12B2_PG_CONTAINER;
let database = "u12b2_template";
const digestSql = (letter: string) => `'sha256:' || repeat('${letter}',64)`;
function sql(statement: string) {
  return execFileSync("docker", ["exec", "-i", container!, "psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], {
    input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim().split("\n").filter((line) => line && line !== "SET").join("\n");
}
function clone(name: string) {
  sql(`CREATE DATABASE ${name} TEMPLATE u12b2_template`);
  database = name;
}
function concurrent(statement: string) {
  const child = spawn("docker", ["exec", "-i", container!, "psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database]);
  let output = "";
  child.stdout.on("data", (data) => { output += data; });
  child.stderr.on("data", (data) => { output += data; });
  child.stdin.end(statement);
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, output }));
  });
}
const digest = (letter: string) => `sha256:${letter.repeat(64)}`;
function seedPromotionFixture(expires = "clock_timestamp()+interval '1 hour'") {
  sql(`
    INSERT INTO public.refresh_policies VALUES ('policy','refresh-policy/v1','{}',${digestSql("a")});
    INSERT INTO public.baseline_manifests (id,canonical_bytes,digest,build_epoch,root_digest,snapshot_digest,evidence_digest,coverage_bytes,watermarks_bytes,provenance_bytes,custody_refs_bytes)
      VALUES ('baseline','{}',${digestSql("b")},0,${digestSql("c")},${digestSql("d")},${digestSql("e")},'{}','{}','{}','[]');
    INSERT INTO public.authority_candidates (id,manifest_bytes,manifest_digest,version,release_id,deployment_id,full_sha,domain,target,scope,valid_from,expires_at,policy_id,baseline_manifest_id)
      VALUES ('candidate','{}',${digestSql("f")},'authority-candidate/v1','release','deployment',repeat('1',40),'example.test','production','catalog',clock_timestamp()-interval '1 hour',${expires},'policy','baseline');
    INSERT INTO public.candidate_technical_verifications (id,candidate_id,verifier_id,verifier_class,result,evidence_bytes,evidence_digest,verified_at,deadline_at)
      VALUES ('technical','candidate','verifier','independent','PASS','{}',${digestSql("2")},clock_timestamp()-interval '1 minute',${expires});
    INSERT INTO public.production_readiness_promotions (id,candidate_digest,deployment_id,commit_sha,owner,rollback_authority,expires_at,state,updated_at)
      VALUES ('promotion',${digestSql("f")},'deployment',repeat('1',40),'owner','owner',${expires},'PROMOTED',clock_timestamp());
    INSERT INTO public.production_readiness_publications (id,promotion_id,target,state,verified_at) VALUES ('publication','promotion','production','PROMOTED',clock_timestamp());
    INSERT INTO public.authority_lifecycle_reservations VALUES ('reservation','{"publicationId":"publication"}',0,${digestSql("3")},'receipt');
    INSERT INTO public.approval_receipts (idempotency_key,request_digest,actor_id,approved_at,grant_expires_at,candidate_admission_id,candidate_verification_id,reviewed_payload_bytes,reviewed_payload_digest)
      VALUES ('approval',${digestSql("4")},'owner',clock_timestamp(),${expires},'candidate','technical','{}',${digestSql("5")});
    INSERT INTO public.governed_catalogs (id,state,governed_generation,authority_adoption)
      VALUES ('catalog','LIVE',0,jsonb_build_object('verificationId','technical','incarnation','00000000-0000-4000-8000-000000000001','policyDigest',${digestSql("a")},'buildDigest',${digestSql("6")},'healthVersion','0','lineage',${digestSql("7")}));
    INSERT INTO public.authority_lifecycle_outcomes (operation_id,request,reservation_id,approval_id,verification_id,publication_id,final_checked_at,expires_at,proof)
      VALUES ('authority','{}','reservation','approval','technical','publication',clock_timestamp(),clock_timestamp()+interval '1 hour',jsonb_build_object('adoption',jsonb_build_object('policyDigest',${digestSql("a")})));
    INSERT INTO public.verifier_envelope_commitments (id,envelope_bytes,envelope_digest,authenticated_verifier)
      VALUES ('00000000-0000-4000-8000-000000000010','{}',${digestSql("8")},'ofertasuper_verifier');
    INSERT INTO public.promotion_ready_envelope_admissions (id,commitment_id,request_key,request_digest,envelope_bytes,envelope_digest,payload,candidate_digest,delta_digest,incarnation,policy_digest,build_digest,health_version,predecessor_generation,predecessor_lineage,evidence_digest,observed_at,verified_at,authenticated_verifier)
      VALUES ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000010','admission',${digestSql("9")},'{}',${digestSql("0")},'{}',${digestSql("f")},${digestSql("b")},'00000000-0000-4000-8000-000000000001',${digestSql("a")},${digestSql("6")},0,0,${digestSql("7")},${digestSql("e")},clock_timestamp(),clock_timestamp(),'ofertasuper_verifier');
    INSERT INTO public.sealed_generation_manifests (id,admission_id,publication_id,manifest_bytes,manifest_digest)
      VALUES ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000011','publication','{}',${digestSql("c")});
    INSERT INTO public.sealed_generation_delta_items VALUES ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000011',0,'product','sku','product:sku',jsonb_build_object('ean','sku','name','new','brand',null,'description',null,'imageUrl',null,'images','[]'::jsonb,'category',null),false);
    INSERT INTO public.catalog_operations VALUES ('baseline','begin_baseline','baseline','{}','baseline','PENDING');
    INSERT INTO public.products (ean,name) VALUES ('sku','source-before-seal');
    INSERT INTO public.serving_products (ean,name,content_digest,last_operation_id) VALUES ('sku','old','old','baseline');
  `);
}
function promote(key = "delta", manifestId = "00000000-0000-4000-8000-000000000012") {
  return `SET SESSION AUTHORIZATION ofertasuper_authority; SELECT public.promote_delta(jsonb_build_object('key','${key}','manifestId','${manifestId}','expectedGeneration','0','expectedHealthVersion','0'));`;
}

test("PostgreSQL promote_delta rolls back expiry, audit failure, and conflicts while publishing one sealed generation", { skip: !container }, async () => {
  assert.equal(execFileSync("docker", ["inspect", "--format", '{{index .Config.Labels "os03.u12b2.disposable"}}', container!], { encoding: "utf8" }).trim(), "true");
  clone("u12b2_expiry");
  seedPromotionFixture("clock_timestamp()-interval '1 second'");
  assert.throws(() => sql(promote()), /final DB-clock/);
  assert.equal(sql("SELECT count(*) FROM public.generation_promotion_operations"), "0");
  assert.equal(sql("SELECT name FROM public.serving_products WHERE ean='sku'"), "old");

  clone("u12b2_success");
  seedPromotionFixture();
  sql("CREATE FUNCTION public.u12b2_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit evidence failure'; END $$; CREATE TRIGGER u12b2_fail BEFORE INSERT ON public.generation_promotion_operations FOR EACH ROW EXECUTE FUNCTION public.u12b2_fail()");
  assert.throws(() => sql(promote()), /audit evidence failure/);
  assert.equal(sql("SELECT name FROM public.serving_products WHERE ean='sku'"), "old");
  assert.equal(sql("SELECT count(*) FROM public.governed_generation_records"), "0");
  sql("DROP TRIGGER u12b2_fail ON public.generation_promotion_operations");
  sql("UPDATE public.products SET name='source-diverged-after-seal' WHERE ean='sku'");
  assert.throws(() => sql("SET SESSION AUTHORIZATION ofertasuper_authority; SELECT name FROM public.products WHERE ean='sku'"), /permission denied/);
  assert.equal(sql(promote()), "delta");
  assert.equal(sql("SELECT name||':'||governed_generation FROM public.serving_products JOIN public.governed_catalogs ON id='catalog' WHERE ean='sku'"), "new:1");
  assert.equal(sql("SELECT name FROM public.products WHERE ean='sku'"), "source-diverged-after-seal");
  assert.equal(sql(promote()), "delta");
  assert.throws(() => sql(promote("delta", "00000000-0000-4000-8000-000000000013")), /idempotency conflict/);
  assert.equal(sql("SELECT count(*) FROM public.generation_promotion_operations"), "1");
  assert.throws(() => sql("SET SESSION AUTHORIZATION ofertasuper_authority; SELECT public.inspect_delta_promotion('{\"key\":\"unknown\"}')"), /outcome is unknown/);
  assert.equal(sql("SET SESSION AUTHORIZATION ofertasuper_authority; SELECT (public.inspect_delta_promotion('{\"key\":\"delta\"}')->>'operationId') || ':' || (public.inspect_delta_promotion('{\"key\":\"delta\"}')->>'eligibleNow')"), "delta:true");
  assert.equal(sql("SELECT count(*) FROM public.generation_promotion_operations"), "1");

  clone("u12c_revoked_publication");
    seedPromotionFixture();
    assert.equal(sql(promote("revoked")), "revoked");
    sql("UPDATE public.production_readiness_publications SET state='REVOKED' WHERE id='publication'");
    assert.equal(sql("SET SESSION AUTHORIZATION ofertasuper_authority; SELECT public.inspect_delta_promotion('{\"key\":\"revoked\"}')->>'eligibleNow'"), "false");

    clone("u12c_superseded_generation");
    seedPromotionFixture();
    assert.equal(sql(promote("superseded")), "superseded");
    sql("SET governed_catalog.procedure='promote_delta'; UPDATE public.governed_catalogs SET governed_generation=2, authority_adoption=authority_adoption || jsonb_build_object('generation','2','lineage','sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff') WHERE id='catalog'");
    assert.equal(sql("SET SESSION AUTHORIZATION ofertasuper_authority; SELECT public.inspect_delta_promotion('{\"key\":\"superseded\"}')->>'eligibleNow'"), "false");

    clone("u12c_late_observation");
  seedPromotionFixture("clock_timestamp()+interval '1 second'");
  assert.equal(sql(promote("late")), "late");
  assert.equal(sql("SELECT pg_sleep(1.1); SET SESSION AUTHORIZATION ofertasuper_authority; SELECT (public.inspect_delta_promotion('{\"key\":\"late\"}')->>'eligibleNow') || ':' || (public.inspect_delta_promotion('{\"key\":\"late\"}')->>'eligibleObservationProven')"), "false:false");
  assert.equal(sql("SELECT count(*) FROM public.generation_promotion_operations WHERE request_key='late'"), "1");

  clone("u12b2_cas");
  seedPromotionFixture();
  const observer = concurrent("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT name FROM public.serving_products WHERE ean='sku'; SELECT pg_sleep(1); SELECT name FROM public.serving_products WHERE ean='sku'; COMMIT;");
  for (let i = 0; ; i++) {
    if (sql("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event='PgSleep'") === "1") break;
    assert.ok(i < 50, "reader reaches the snapshot barrier");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const first = concurrent(`BEGIN; ${promote("winner")} SELECT pg_sleep(0.4); COMMIT;`);
  for (let i = 0; ; i++) {
    if (sql("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event='PgSleep'") === "2") break;
    assert.ok(i < 50, "winner reaches the commit barrier");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const second = await concurrent(promote("loser"));
  assert.equal((await first).code, 0);
  assert.deepEqual((await observer).output.split("\n").filter((line) => line === "old"), ["old", "old"]);
  assert.equal(sql("SELECT name FROM public.serving_products WHERE ean='sku'"), "new");
  assert.notEqual(second.code, 0);
  assert.match(second.output, /stale promotion binding|final DB-clock/);
  assert.equal(sql("SELECT count(*) FROM public.generation_promotion_operations"), "1");
});

const request = () => createGenerationPromotionFoundationRequest({
  requestKey: "delta-foundation-1",
  admissionId: "00000000-0000-4000-8000-000000000001",
  manifestDigest: digest("a"),
  incarnation: "00000000-0000-4000-8000-000000000002",
  generation: "1",
  predecessorGeneration: "0",
  predecessorLineage: digest("b"),
  resultLineage: digest("c"),
  policyDigest: digest("d"),
  buildDigest: digest("e"),
  healthVersion: "0",
  evidenceDigest: digest("f"),
  auditDigest: digest("0"),
  publishingAdoptionId: "00000000-0000-4000-8000-000000000003",
});

test("defines immutable g>0 foundation bindings without a public-effect procedure", () => {
  assert.equal(existsSync(migrationPath), true, "U12b1 migration is required");
  const sql = readFileSync(migrationPath, "utf8");
  assert.match(sql, /CREATE TABLE public\.sealed_generation_manifests/);
  assert.match(sql, /CREATE TABLE public\.governed_generation_records/);
  assert.match(sql, /admission_id UUID NOT NULL UNIQUE REFERENCES public\.promotion_ready_envelope_admissions\(id\) ON DELETE RESTRICT/);
  assert.match(sql, /manifest_id UUID NOT NULL UNIQUE REFERENCES public\.sealed_generation_manifests\(id\) ON DELETE RESTRICT/);
  assert.match(sql, /generation BIGINT NOT NULL CHECK \(generation > 0\)/);
  assert.match(sql, /predecessor_generation BIGINT NOT NULL CHECK \(predecessor_generation >= 0\)/);
  assert.match(sql, /CREATE TABLE public\.generation_promotion_operations/);
  assert.match(sql, /CREATE TABLE public\.generation_publishing_adoptions/);
  assert.match(sql, /CREATE TRIGGER governed_generation_record_immutable/);
  assert.match(sql, /CREATE TABLE public\.generation_promotion_operations/);
});

test("foundation repository exposes inspection only", async () => {
  let query = "";
  const repository = createGenerationPromotionFoundationRepository({ execute: async (sql) => {
    query = sql;
    return { rows: [] };
  } });
  assert.equal(await repository.inspect("00000000-0000-4000-8000-000000000001"), null);
  assert.match(query, /^SELECT /);
  assert.doesNotMatch(query, /UPDATE|INSERT|DELETE|promote_delta/i);
});

test("requires every immutable foundation binding and rejects a generation-zero contract", () => {
  assert.equal(request().generation, "1");
  assert.throws(() => createGenerationPromotionFoundationRequest({ ...request(), generation: "0" }), /generation must be positive/);
  assert.throws(() => createGenerationPromotionFoundationRequest({ ...request(), auditDigest: "" }), /audit digest is required/);
  assert.throws(() => createGenerationPromotionFoundationRequest({ ...request(), admissionId: "not-a-uuid" }), /admission ID is required/);
});

test("seals deterministically ordered six-entity after-images without a promotion effect", () => {
  const items = createSealedGenerationDeltaItems({ manifestId: "00000000-0000-4000-8000-000000000004", admissionId: request().admissionId, items: [
    { entity: "offer", key: "ean-2:1", afterImage: { price: "2.00" }, tombstone: false },
    { entity: "product", key: "ean-1", afterImage: null, tombstone: true },
  ] });
  assert.deepEqual(items.map(({ ordinal, typeIdentity, tombstone }) => ({ ordinal, typeIdentity, tombstone })), [
    { ordinal: 0, typeIdentity: "product:ean-1", tombstone: true },
    { ordinal: 1, typeIdentity: "offer:ean-2:1", tombstone: false },
  ]);
  const sql = readFileSync(migrationPath, "utf8");
  assert.match(sql, /CREATE TABLE public\.sealed_generation_delta_items/);
  assert.match(sql, /FOREIGN KEY \(manifest_id, admission_id\) REFERENCES public\.sealed_generation_manifests\(id, admission_id\) ON DELETE RESTRICT/);
  assert.match(sql, /CREATE TRIGGER sealed_generation_delta_item_immutable/);
  assert.match(sql, /CREATE TABLE public\.sealed_generation_delta_items/);
});

test("rejects duplicate, malformed, and unbound sealed delta items", () => {
  const input = { manifestId: "00000000-0000-4000-8000-000000000004", admissionId: request().admissionId };
  assert.throws(() => createSealedGenerationDeltaItems({ ...input, items: [
    { entity: "product", key: "ean", afterImage: { name: "x" }, tombstone: false },
    { entity: "product", key: "ean", afterImage: { name: "y" }, tombstone: false },
  ] }), /duplicate/);
  assert.throws(() => createSealedGenerationDeltaItems({ ...input, items: [{ entity: "history", key: "1", afterImage: {}, tombstone: true }] }), /invalid/);
  assert.throws(() => createSealedGenerationDeltaItems({ ...input, admissionId: "not-a-uuid", items: [{ entity: "membership", key: "1:ean", afterImage: null, tombstone: true }] }), /admission ID/);
});

test("U12b2 defines one final-clock guarded promote_delta transaction bound to a promoted publication", () => {
  const sql = readFileSync(migrationPath, "utf8");
  assert.match(sql, /publication_id TEXT NOT NULL REFERENCES public\.production_readiness_publications\(id\) ON DELETE RESTRICT/);
  assert.match(sql, /CREATE FUNCTION public\.promote_delta\(r JSONB\)/);
  assert.match(sql, /session_user::text <> 'ofertasuper_authority'/);
  assert.match(sql, /clock_timestamp\(\)/);
  assert.match(sql, /'promote_delta'/);
  assert.match(sql, /INSERT INTO public\.governed_generation_records/);
  assert.match(sql, /INSERT INTO public\.generation_promotion_operations/);
  assert.match(sql, /INSERT INTO public\.generation_publishing_adoptions/);
  assert.match(sql, /INSERT INTO public\.catalog_operations/);
});

test("U12b2 repository sends exactly one sealed request to promote_delta", async () => {
  let query = "";
  let values: unknown[] = [];
  const repository = createDeltaPromotionRepository({ execute: async (sql, input) => {
    query = sql;
    values = input;
    return { rows: [{ operation_id: "delta-op" }] };
  } });
  assert.deepEqual(await repository.promote({
    key: "delta-op", manifestId: "00000000-0000-4000-8000-000000000004", expectedGeneration: "0", expectedHealthVersion: "0",
  }), { operationId: "delta-op" });
  assert.match(query, /^SELECT public\.promote_delta\(\$1::jsonb\)/);
  assert.deepEqual(values, [JSON.stringify({ key: "delta-op", manifestId: "00000000-0000-4000-8000-000000000004", expectedGeneration: "0", expectedHealthVersion: "0" })]);
});

test("U12c recovery reads one exact committed promotion proof without replaying publication", async () => {
  let query = "";
  let values: unknown[] = [];
  const repository = createDeltaRecoveryRepository({ execute: async (sql, input) => {
    query = sql;
    values = input;
    return { rows: [{ result: { operationId: "delta", eligible: true } }] };
  } });
  assert.deepEqual(await repository.inspect({ key: "delta" }), { operationId: "delta", eligible: true });
  assert.match(query, /^SELECT public\.inspect_delta_promotion\(\$1::jsonb\) AS result$/);
  assert.doesNotMatch(query, /promote_delta|INSERT|UPDATE|DELETE/i);
  assert.deepEqual(values, [JSON.stringify({ key: "delta" })]);
});

test("rejects untyped unknown entities and freezes nested after-images", () => {
  const input = { manifestId: "00000000-0000-4000-8000-000000000004", admissionId: request().admissionId };
  assert.throws(() => createSealedGenerationDeltaItems({ ...input, items: [{ entity: "unknown", key: "x", afterImage: {}, tombstone: false }] as never }), /invalid/);
  const afterImage = { nested: { price: "2.00" } };
  const [item] = createSealedGenerationDeltaItems({ ...input, items: [{ entity: "offer", key: "ean:1", afterImage, tombstone: false }] });
  assert.throws(() => { (item.afterImage as { nested: { price: string } }).nested.price = "3.00"; }, TypeError);
  assert.equal((item.afterImage as { nested: { price: string } }).nested.price, "2.00");
});
