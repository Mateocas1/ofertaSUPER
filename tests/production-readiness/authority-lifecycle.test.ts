import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { test } from "node:test";
import { createAuthorityRevokeConsentService } from "../../src/lib/production-readiness/approval";
import { createAuthorityLifecycleRepository, createAuthorityRevokeConsentRepository } from "../../src/lib/production-readiness/repository";

const request = {
  key: "activation-1", reservationId: "reservation-1", approvalId: "approval-1",
  verificationId: "verification-1", attemptId: "attempt-1", expectedEpoch: "0",
  expectedVersion: 0, expectedGeneration: null, actorId: "executor-1",
};

test("activation returns committed identity without a readback activation gate", async () => {
  const calls: string[] = [];
  const repository = createAuthorityLifecycleRepository({ execute: async (sql, values) => {
    calls.push(sql);
    assert.deepEqual(JSON.parse(String(values[0])), request);
    return { rows: [{ operation_id: "activation-1" }] };
  } });
  assert.deepEqual(await repository.activate(request), { operationId: "activation-1" });
  assert.deepEqual(calls, ["SELECT public.activate_authority($1::jsonb) AS operation_id"]);
});

test("unknown activation never triggers automatic replay or compensation", async () => {
  let writes = 0;
  const repository = createAuthorityLifecycleRepository({ execute: async () => {
    writes++;
    if (writes === 1) throw new Error("response lost");
    return { rows: [] };
  } });
  await assert.rejects(repository.activate(request), /response lost/);
  assert.equal(writes, 1);
  await assert.rejects(repository.activate({ ...request, key: "separate-operation" }), /unknown; do not replay or compensate/);
  assert.equal(writes, 2);
});

// The outer harness creates exactly one disposable container and installs cleanup before creation.
const container = process.env.U11_PG_CONTAINER;
let database = "u11_proof";
function sql(statement: string) {
  return execFileSync("docker", ["exec", "-i", container!, "psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], {
    input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim().split("\n").filter((line) => line !== "SET").join("\n");
}
function clone(name: string) {
  sql(`CREATE DATABASE ${name} TEMPLATE u11_template`);
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
function activate(overrides = {}) {
  return `SET SESSION AUTHORIZATION ofertasuper_authority; SELECT public.activate_authority('${JSON.stringify({ ...request, ...overrides })}'::jsonb);`;
}

test("PostgreSQL activation is atomic, epoch-fenced, and exactly recoverable", { skip: !container }, () => {
  const label = execFileSync("docker", ["inspect", "--format", '{{index .Config.Labels "os03.u11.disposable"}}', container!], { encoding: "utf8" }).trim();
  assert.equal(label, "true");
  sql(`
    INSERT INTO public.governed_catalogs (id,state,active_build_attempt_id) VALUES ('catalog','FROZEN','attempt-1');
    INSERT INTO public.baseline_build_attempts (id,epoch,status,deadline_at,expected_row_count,uploaded_row_count,snapshot_id,root_digest,verifier_snapshot_id,verifier_root_digest)
      VALUES ('attempt-1',0,'FROZEN',clock_timestamp()+interval '1 hour',1,1,'snapshot-1','sha256:'||repeat('a',64),'snapshot-1','sha256:'||repeat('a',64));
    INSERT INTO public.catalog_operations VALUES ('baseline-upload','begin_baseline','upload','{}','digest','PENDING');
    INSERT INTO public.serving_products (ean,name,content_digest,last_operation_id) VALUES ('123','frozen product','digest','baseline-upload');
    INSERT INTO public.refresh_policies (id,version,canonical_bytes,digest) VALUES ('policy-1','refresh-policy/v1','{}','sha256:'||repeat('b',64));
    INSERT INTO public.baseline_manifests (id,canonical_bytes,digest,build_epoch,root_digest,snapshot_digest,evidence_digest,coverage_bytes,watermarks_bytes,provenance_bytes,custody_refs_bytes)
      VALUES ('baseline-1','{}','sha256:'||repeat('a',64),0,'sha256:'||repeat('a',64),'sha256:'||repeat('c',64),'sha256:'||repeat('d',64),'{}','{}','{"buildAttemptId":"attempt-1"}','[]');
    INSERT INTO public.authority_candidates (id,manifest_bytes,manifest_digest,version,release_id,deployment_id,full_sha,domain,target,scope,valid_from,expires_at,policy_id,baseline_manifest_id)
      VALUES ('candidate-1','{}','sha256:'||repeat('e',64),'authority-candidate/v1','release-1','00000000-0000-4000-8000-000000000001',repeat('f',40),'example.test','preview','catalog:ar',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour','policy-1','baseline-1');
    INSERT INTO public.authority_lifecycle_reservations VALUES ('reservation-1','{"version":2,"domain":"example.test","target":"preview","scope":"catalog:ar","deploymentId":"00000000-0000-4000-8000-000000000001","publicationId":"00000000-0000-4000-8000-000000000002","incarnation":"00000000-0000-4000-8000-000000000003"}',0,'sha256:'||repeat('1',64),'configuration-receipt-1');
    INSERT INTO public.candidate_technical_verifications (id,candidate_id,verifier_id,verifier_class,result,evidence_bytes,evidence_digest,verified_at,deadline_at)
      SELECT 'verification-1','candidate-1','verifier-1','independent','PASS',jsonb_build_object('selector',selector,'buildDigest',build_digest)::text,'sha256:'||repeat('2',64),clock_timestamp()-interval '10 seconds',clock_timestamp()+interval '1 hour' FROM public.authority_lifecycle_reservations;
    INSERT INTO public.approval_receipts VALUES ('approval-1','request-1','approver-1',clock_timestamp(),'candidate-1','verification-1','{}','sha256:'||repeat('e',64),clock_timestamp()+interval '30 minutes');
    INSERT INTO public.publication_grants (id,user_id,action,scope,target,policy_digest,expires_at)
      SELECT action,'executor-1',action,'catalog:ar','preview','sha256:'||repeat('b',64),clock_timestamp()+interval '1 hour' FROM unnest(ARRAY['activate']) action;
  `);
  sql("CREATE DATABASE u11_template TEMPLATE u11_proof");
  const original = sql("SELECT state FROM public.governed_catalogs WHERE id='catalog'");
  assert.equal(original, "FROZEN");
  assert.throws(() => sql(`BEGIN; ${activate({ expectedEpoch: "1" })} COMMIT;`), /epoch|binding/);
  assert.throws(() => sql(`BEGIN; ${activate({ approvalId: "absent" })} COMMIT;`), /approval/);
  assert.throws(() => sql(`BEGIN; SELECT public.governed_catalog_abandon_baseline('attempt-1',0); ${activate()} COMMIT;`), /epoch|FROZEN/);
  sql("CREATE FUNCTION public.u11_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'indispensable audit failure'; END $$; CREATE TRIGGER u11_audit_failure BEFORE INSERT ON public.authority_lifecycle_audits FOR EACH ROW EXECUTE FUNCTION public.u11_audit_failure();");
  assert.throws(() => sql(activate()), /indispensable audit failure/);
  assert.equal(sql("SELECT state FROM public.governed_catalogs WHERE id='catalog'"), "FROZEN");
  assert.equal(sql("SELECT count(*) FROM public.authority_lifecycle_outcomes"), "0");
  sql("DROP TRIGGER u11_audit_failure ON public.authority_lifecycle_audits");
  assert.equal(sql(activate()), "activation-1");
  // No inspect has run: all terminal state and exact adoption already exist.
  assert.equal(sql("SELECT c.state||':'||c.governed_generation||':'||a.status FROM public.governed_catalogs c JOIN public.baseline_build_attempts a ON a.id=c.active_build_attempt_id"), "LIVE:0:LIVE");
  assert.equal(sql("SELECT count(*) FROM public.authority_lifecycle_audits"), "1");
  assert.equal(sql(activate()), "activation-1");
  assert.equal(sql("SELECT count(*) FROM public.production_readiness_receipts WHERE promotion_id='activation-1' AND state='PROMOTED'"), "2");
  assert.equal(sql("SELECT (c.authority_adoption=o.proof->'adoption')::text FROM public.governed_catalogs c JOIN public.authority_lifecycle_outcomes o ON o.operation_id='activation-1'"), "true");
  for (const table of ["authority_lifecycle_outcomes", "authority_lifecycle_audits"]) assert.throws(() => sql(`DELETE FROM public.${table}`), /immutable/);
  assert.throws(() => sql(activate({ expectedVersion: 1 })), /idempotency conflict/);
  assert.throws(() => sql(activate({ key: "competitor" })), /reservation conflict/);
  assert.throws(() => sql("SELECT public.governed_catalog_abandon_baseline('attempt-1',0)"), /epoch/);
  assert.throws(() => sql("SELECT public.governed_catalog_cleanup_abandoned_baseline('attempt-1',0,100)"), /archive/);
  assert.equal(sql("SELECT count(*) FROM public.serving_products WHERE ean='123'"), "1");
  assert.equal(sql("SELECT count(*) FROM public.authority_lifecycle_audits"), "1");
});


test("PostgreSQL final-clock rollback and post-check commit barrier preserve historical proof", { skip: !container }, () => {
  clone("u11_expiry");
  sql("INSERT INTO public.approval_receipts SELECT 'expired',request_digest,actor_id,approved_at,candidate_admission_id,candidate_verification_id,reviewed_payload_bytes,reviewed_payload_digest,clock_timestamp()-interval '1 second' FROM public.approval_receipts");
  assert.throws(() => sql(activate({ approvalId: "expired" })), /final DB-clock/);
  assert.equal(sql("SELECT count(*) FROM public.authority_lifecycle_outcomes"), "0");
  sql("INSERT INTO public.approval_receipts SELECT 'brief',request_digest,actor_id,approved_at,candidate_admission_id,candidate_verification_id,reviewed_payload_bytes,reviewed_payload_digest,clock_timestamp()+interval '2 seconds' FROM public.approval_receipts WHERE idempotency_key='approval-1'");
  sql(`BEGIN; ${activate({ approvalId: "brief" })} SET SESSION AUTHORIZATION DEFAULT;
    DO $$ BEGIN FOR i IN 1..20 LOOP
      EXIT WHEN clock_timestamp() >= (SELECT expires_at FROM public.authority_lifecycle_outcomes);
      PERFORM pg_sleep(0.5);
    END LOOP; END $$; COMMIT;`);
  assert.equal(sql("SELECT (final_checked_at < expires_at AND clock_timestamp() >= expires_at)::text FROM public.authority_lifecycle_outcomes WHERE operation_id='activation-1'"), "true");
  assert.equal(sql("SELECT state FROM public.governed_catalogs"), "LIVE");
  assert.equal(sql(activate({ approvalId: "brief" })), "activation-1");
  assert.equal(sql("SELECT count(*) FROM public.authority_lifecycle_audits"), "1");
});

test("PostgreSQL abandon and activate contenders serialize to exactly one winner", { skip: !container }, async () => {
  for (const winner of ["activate", "abandon"]) {
    clone(`u11_race_${winner}`);
    const abandon = "SELECT public.governed_catalog_abandon_baseline('attempt-1',0);";
    const first = concurrent(`BEGIN; ${winner === "activate" ? activate() : abandon} SELECT pg_sleep(1); COMMIT;`);
    // Observe the actual transaction barrier, not an assumed scheduling delay.
    for (let i = 0; ; i++) {
      if (sql("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event='PgSleep'") === "1") break;
      assert.ok(i < 50, "contender must reach the pre-commit barrier");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const second = concurrent(winner === "activate" ? abandon : activate());
    const results = await Promise.all([first, second]);
    assert.equal(results[0].code, 0, results[0].output);
    assert.notEqual(results[1].code, 0);
    assert.match(results[1].output, /epoch|FROZEN/);
    assert.equal(sql("SELECT count(*) FROM public.authority_lifecycle_outcomes"), winner === "activate" ? "1" : "0");
    assert.equal(sql("SELECT count(*) FROM public.serving_products WHERE ean='123'"), "1");
  }
});

test("inspection is exact read-only discovery, never another activation", async () => {
  const proof = { operationId: "activation-1", eligible: false, proof: { expiresAt: "original" } };
  const repository = createAuthorityLifecycleRepository({ execute: async (query, values) => {
    assert.equal(query, "SELECT public.inspect_authority($1,$2,$3) AS result");
    assert.deepEqual(values, ["activation-1", "reservation-1", "executor-1"]);
    return { rows: [{ result: proof }] };
  } });
  assert.deepEqual(await repository.inspect("activation-1", "reservation-1", "executor-1"), proof);
});

test("PostgreSQL lost-response inspection preserves proof and uses live DB time without writes", { skip: !container }, () => {
  clone("u11_inspection");
  const inspect = (operation = "activation-1", reservation = "reservation-1", actor = "executor-1") =>
    `SET SESSION AUTHORIZATION ofertasuper_authority; SELECT public.inspect_authority('${operation}','${reservation}','${actor}')`;
  assert.throws(() => sql(inspect()), /operation not found/);
  sql("INSERT INTO public.approval_receipts SELECT 'brief',request_digest,actor_id,approved_at,candidate_admission_id,candidate_verification_id,reviewed_payload_bytes,reviewed_payload_digest,clock_timestamp()+interval '3 seconds' FROM public.approval_receipts");
  sql(activate({ approvalId: "brief" })); // Discard the activation response deliberately.
  const first = JSON.parse(sql(`BEGIN READ ONLY; ${inspect()}; COMMIT;`).split("\n")[1]);
  assert.equal(first.operationId, "activation-1");
  assert.equal(first.eligible, true);
  assert.throws(() => sql(inspect("activation-1", "other")), /identity conflict/);
  assert.throws(() => sql(inspect("activation-1", "reservation-1", "unauthorized")), /scoped executor grant/);
  sql("SELECT pg_sleep(3.1)");
  const late = JSON.parse(sql(inspect()));
  assert.equal(late.eligible, false);
  assert.equal(late.reason, "ineligible");
  assert.deepEqual(late.proof, first.proof);
  assert.equal(late.finalCheckedAt, first.finalCheckedAt);
  assert.equal(late.expiresAt, first.expiresAt);
  assert.ok(Date.parse(late.observedAt) > Date.parse(first.observedAt));
  assert.equal(sql("SELECT count(*) FROM public.authority_lifecycle_audits"), "1");
  assert.equal(sql("SELECT count(*) FROM public.authority_lifecycle_outcomes"), "1");
  assert.equal(sql("SELECT has_function_privilege('public','public.inspect_authority(text,text,text)','execute')"), "f");
});

test("guarded route closures execute actual activation and inspection SQL in PostgreSQL", { skip: !container }, async () => {
  clone("u11_routes");
  const { createAuthorityRoute } = await import("../../src/lib/production-readiness/operations");
  const dependencies = {
    access: async () => ({ principal: { userId: "executor-1", sessionId: "test-session" } }),
    execute: async (query: string, values: unknown[]) => {
      const bound = query.replace(/\$(\d+)/g, (_, n) => "'" + String(values[Number(n) - 1]).replaceAll("'", "''") + "'");
      const authority = /public\.(activate|inspect|revoke)_authority/.test(bound) ? "SET SESSION AUTHORIZATION ofertasuper_authority; " : "";
      return { rows: sql(`${authority}SELECT row_to_json(bound_row) FROM (${bound}) bound_row`).split("\n").filter(Boolean).map((row) => JSON.parse(row)) };
    },
  };
  const send = (action: "activate" | "inspect", body: unknown) => createAuthorityRoute(action, dependencies)(new Request(`https://example.test/api/admin/catalog-authority/${action}`, {
    method: "POST", headers: { "content-type": "application/json", origin: "https://example.test", "sec-fetch-site": "same-origin" }, body: JSON.stringify(body),
  }));
  const body = { ...request, actorId: undefined };
  assert.equal((await send("activate", body)).status, 200);
  assert.equal((await send("activate", { ...body, expectedVersion: 1 })).status, 409);
  assert.equal((await send("inspect", { operationId: "absent", reservationId: body.reservationId })).status, 404);
  const recovered = await send("inspect", { operationId: body.key, reservationId: body.reservationId });
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).proof.executingActor, "executor-1");
  sql("UPDATE public.publication_grants SET revoked_at=clock_timestamp() WHERE action='activate'");
  assert.equal((await send("inspect", { operationId: body.key, reservationId: body.reservationId })).status, 403);
  assert.equal(sql("SELECT count(*) FROM public.authority_lifecycle_audits"), "1");
});

// Trusted test principals exercise the consent DAL; this is not live Clerk authentication.
test("revoke consent denies absent sessions before persistence", async () => {
  const service = createAuthorityRevokeConsentService(createAuthorityRevokeConsentRepository({ execute: async () => {
    throw new Error("persistence must not run");
  } }));
  await assert.rejects(service.prepare(null, "activation-1", "incident"), /authenticated Clerk session/);
  await assert.rejects(service.prepare({ userId: "actor", sessionId: "" }, "activation-1", "incident"), /authenticated Clerk session/);
});

test("PostgreSQL revoke consent binds action, current identity, actor, proof and exact expiry without revocation", { skip: !container }, async () => {
  clone("u11_revoke_consent");
  sql(activate());
  let confirmation = "";
  const execute = async (query: string, values: unknown[]) => {
    if (query.includes("record_authority_revoke_consent")) confirmation = String(values[0]);
    const bound = query.replace(/\$(\d+)/g, (_, n) => "'" + String(values[Number(n) - 1]).replaceAll("'", "''") + "'");
    return { rows: sql(`SELECT row_to_json(bound_row) FROM (${bound}) bound_row`).split("\n").filter(Boolean).map((row) => JSON.parse(row)) };
  };
  const repository = createAuthorityRevokeConsentRepository({ execute });
  const service = createAuthorityRevokeConsentService(repository);
  const principal = { userId: "executor-1", sessionId: "test-session" };
  await assert.rejects(service.prepare(principal, "activation-1", "incident"), /scoped revoke grant/);
  sql("INSERT INTO public.publication_grants (id,user_id,action,scope,target,policy_digest,expires_at) SELECT 'revoke',user_id,'authority-revoke',scope,target,policy_digest,clock_timestamp()+interval '30 minutes' FROM public.publication_grants");
  await assert.rejects(service.prepare(principal, "absent", "incident"), /authority binding/);
  await assert.rejects(service.prepare(principal, "activation-1", " "), /reason/);
  const challenge = await service.prepare(principal, "activation-1", "incident");
  const input = { ...challenge, challengeId: challenge.id, idempotencyKey: "revoke-key", consent: true as const, origin: "https://example.test", fetchSite: "same-origin" };
  assert.equal(challenge.reviewed.action, "authority-revoke");
  assert.equal(challenge.reviewed.expectedVersion, 1);
  assert.equal(challenge.reviewed.generation, "0");
  for (const patch of [{ action: "approve" }, { version: "v0" }, { reason: "different" }, { revocationScope: "data" },
    { expectedVersion: 0 }, { scope: "other" }, { releaseId: "other" }, { policyDigest: "other" }, { generation: "1" }]) {
    await assert.rejects(service.confirm(principal, { ...input, reviewed: { ...input.reviewed, ...patch } }), /binding/);
  }
  for (const patch of [{ nonce: "swapped" }, { csrfToken: "swapped" }, { origin: "https://evil.test" }, { fetchSite: "cross-site" }, { consent: false }]) {
    await assert.rejects(service.confirm(principal, { ...input, ...patch }), /consent|origin/);
  }
  await assert.rejects(service.confirm({ ...principal, sessionId: "other" }, input), /consent/);
  await assert.rejects(service.confirm({ ...principal, userId: "other" }, input), /consent/);
  await assert.rejects(service.confirm(principal, { ...input, challengeId: "absent" }), /consent/);
  sql("UPDATE public.authority_lifecycle_reservations SET version=version+1");
  await assert.rejects(service.confirm(principal, input), /binding/);
  const fresh = await service.prepare(principal, "activation-1", "incident");
  const freshInput = { ...input, ...fresh, challengeId: fresh.id };
  const receipt = await service.confirm(principal, freshInput);
  const raw = confirmation.replaceAll("'", "''");
  for (const assignment of ["action='approve'", "scope='other'", "target='other'", "user_id='other'",
    "policy_digest='sha256:'||repeat('c',64)", "revoked_at=clock_timestamp()", "expires_at=expires_at+interval '1 microsecond'"]) {
    assert.throws(() => sql(`BEGIN; UPDATE public.publication_grants SET ${assignment} WHERE id='revoke';
      SELECT public.record_authority_revoke_consent('${raw}'::jsonb); COMMIT;`), /original revoke grant/);
  }
  for (const field of ["action", "reason", "scope", "version", "expectedVersion", "generation", "identity"]) {
    const reviewed = { ...fresh.reviewed };
    delete reviewed[field];
    await assert.rejects(service.confirm(principal, { ...freshInput, reviewed }), /binding/);
  }
  for (const assignment of ["governed_generation=1", "authority_adoption=authority_adoption||'{\"policyDigest\":\"other\"}'::jsonb"]) {
    assert.throws(() => sql(`BEGIN; SELECT set_config('governed_catalog.procedure','activate_authority',true);
      UPDATE public.governed_catalogs SET ${assignment}; SELECT public.record_authority_revoke_consent('${raw}'::jsonb); COMMIT;`), /binding/);
  }
  assert.equal(receipt.idempotencyKey, "revoke-key");
  assert.deepEqual(await service.confirm(principal, freshInput), receipt);
  await assert.rejects(service.confirm(principal, { ...freshInput, idempotencyKey: "replay" }), /replay|conflict/);
  await assert.rejects(service.confirm({ ...principal, sessionId: "other" }, freshInput), /consent/);
  for (const table of ["authority_revoke_challenges", "authority_revoke_receipts"]) {
    assert.throws(() => sql(`DELETE FROM public.${table}`), /immutable/);
  }
  const different = await service.prepare(principal, "activation-1", "second incident");
  await assert.rejects(service.confirm(principal, { ...freshInput, ...different, challengeId: different.id }), /idempotency conflict/);
  const competing = JSON.parse(confirmation);
  const results = await Promise.all(["race-a", "race-b"].map((key) => concurrent(
    `SELECT public.record_authority_revoke_consent('${JSON.stringify({ ...competing, key }).replaceAll("'", "''")}'::jsonb)`)));
  assert.equal(results.filter((result) => result.code === 0).length, 1);
  assert.match(results.find((result) => result.code !== 0)!.output, /replay/);
  assert.equal(sql("SELECT count(*) FROM public.authority_revoke_receipts"), "2");
  assert.equal(sql("SELECT has_function_privilege('public','public.record_authority_revoke_consent(jsonb)','execute')"), "f");
  assert.equal(sql("SELECT state FROM public.production_readiness_publications"), "PROMOTED");
  assert.equal(sql("SELECT state||':'||governed_generation FROM public.governed_catalogs"), "LIVE:0");
  assert.equal(sql("SELECT count(*) FROM public.authority_lifecycle_audits"), "1");
  // Use the DB's microsecond deadline, not a rounded JavaScript Date or transaction-start clock.
  sql("UPDATE public.publication_grants SET expires_at=clock_timestamp()+interval '1.123456 seconds' WHERE id='revoke'");
  const brief = await service.prepare(principal, "activation-1", "expiry incident");
  assert.equal(sql(`SELECT (expires_at=grant_expires_at)::text FROM public.authority_revoke_challenges WHERE id='${brief.id}'`), "true");
  sql(`DO $$ BEGIN WHILE clock_timestamp() < (SELECT expires_at FROM public.authority_revoke_challenges WHERE id='${brief.id}') LOOP PERFORM pg_sleep(0.02); END LOOP; END $$`);
  await assert.rejects(service.confirm(principal, { ...input, ...brief, challengeId: brief.id, idempotencyKey: "expired" }), /expired|grant/);
  assert.equal(sql("SELECT count(*) FROM public.authority_revoke_receipts"), "2");
});


test("revoke repository returns one operation identity and never retries an unknown outcome", async () => {
  const repository = createAuthorityLifecycleRepository({ execute: async () => ({ rows: [] }) });
  await assert.rejects(repository.revoke({ key: "revoke", operationId: "activation-1", reservationId: "reservation-1",
    consentId: "consent", expectedVersion: 1, actorId: "executor-1", sessionHash: "a".repeat(64) }), /unknown; do not replay or compensate/);
});

test("PostgreSQL atomic revoke consumes exact consent, preserves data and serializes competitors", { skip: !container }, async () => {
  clone("u11_revoke");
  sql(activate());
  sql("INSERT INTO public.publication_grants (id,user_id,action,scope,target,policy_digest,expires_at) SELECT 'revoke',user_id,'authority-revoke',scope,target,policy_digest,clock_timestamp()+interval '30 minutes' FROM public.publication_grants");
  let confirmed = "";
  const execute = async (query: string, values: unknown[]) => {
    if (query.includes("record_authority_revoke_consent")) confirmed = String(values[0]);
    const bound = query.replace(/\$(\d+)/g, (_, n) => "'" + String(values[Number(n) - 1]).replaceAll("'", "''") + "'");
    const authority = /public\.(activate|inspect|revoke)_authority/.test(bound) ? "SET SESSION AUTHORIZATION ofertasuper_authority; " : "";
    return { rows: sql(`${authority}SELECT row_to_json(bound_row) FROM (${bound}) bound_row`).split("\n").filter(Boolean).map((row) => JSON.parse(row)) };
  };
  const principal = { userId: "executor-1", sessionId: "test-session" };
  const service = createAuthorityRevokeConsentService(createAuthorityRevokeConsentRepository({ execute }));
  const challenge = await service.prepare(principal, "activation-1", "authority incident only");
  await service.confirm(principal, { ...challenge, challengeId: challenge.id, idempotencyKey: "consent",
    consent: true, origin: "https://example.test", fetchSite: "same-origin" });
  const revokeRequest = { key: "revoke-1", operationId: "activation-1", reservationId: "reservation-1", consentId: "consent",
    expectedVersion: 1, actorId: principal.userId, sessionHash: JSON.parse(confirmed).sessionHash };
  const revoke = (patch = {}) => `SET SESSION AUTHORIZATION ofertasuper_authority; SELECT public.revoke_authority('${JSON.stringify({ ...revokeRequest, ...patch })}'::jsonb)`;
  const secondConsent = await service.prepare(principal, "activation-1", "different reviewed reason");
  await service.confirm(principal, { ...secondConsent, challengeId: secondConsent.id, idempotencyKey: "second-consent",
    consent: true, origin: "https://example.test", fetchSite: "same-origin" });
  sql("CREATE DATABASE u11_revoke_template TEMPLATE u11_revoke");
  const retained = sql("SELECT row_to_json(c) FROM public.governed_catalogs c UNION ALL SELECT row_to_json(p) FROM public.serving_products p");
  for (const patch of [{ consentId: "missing" }, { consentId: null }, { expectedVersion: 0 }, { operationId: "other" },
    { reservationId: "other" }, { actorId: "other" }, { sessionHash: "b".repeat(64) }, { unreviewed: true }]) {
    assert.throws(() => sql(revoke(patch)), /consent|conflict|grant|request/);
  }
  assert.throws(() => sql(`BEGIN; UPDATE public.authority_lifecycle_reservations SET version=2; ${revoke()}; COMMIT;`), /conflict/);
  assert.throws(() => sql(`BEGIN; UPDATE public.publication_grants SET revoked_at=clock_timestamp() WHERE id='revoke'; ${revoke()}; COMMIT;`), /grant/);
  for (const table of ["authority_revoke_outcomes", "authority_revoke_audits"]) {
    sql(`CREATE FUNCTION public.fail_revoke() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'indispensable proof failure'; END $$;
      CREATE TRIGGER fail_revoke BEFORE INSERT ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.fail_revoke()`);
    assert.throws(() => sql(revoke()), /indispensable proof failure/);
    assert.equal(sql("SELECT state FROM public.production_readiness_publications"), "PROMOTED");
    assert.equal(sql("SELECT count(*) FROM public.authority_revoke_outcomes"), "0");
    assert.equal(sql("SELECT version FROM public.authority_lifecycle_reservations"), "1");
    sql(`DROP TRIGGER fail_revoke ON public.${table}; DROP FUNCTION public.fail_revoke()`);
  }
  sql("CREATE FUNCTION public.fail_revoke_proof() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.proof := NULL; RETURN NEW; END $$; CREATE TRIGGER fail_revoke_proof BEFORE INSERT ON public.authority_revoke_outcomes FOR EACH ROW EXECUTE FUNCTION public.fail_revoke_proof()");
  assert.throws(() => sql(revoke()), /null value.*proof/);
  assert.equal(sql("SELECT count(*) FROM public.authority_revoke_outcomes"), "0");
  assert.equal(sql("SELECT count(*) FROM public.authority_revoke_audits"), "0");
  assert.equal(sql("SELECT state FROM public.production_readiness_promotions"), "PROMOTED");
  sql("DROP TRIGGER fail_revoke_proof ON public.authority_revoke_outcomes");
  assert.equal(sql(revoke()), "revoke-1");
  const originalProof = sql("SELECT proof FROM public.authority_revoke_outcomes");
  assert.equal(sql(revoke()), "revoke-1");
  assert.equal(sql("SELECT proof FROM public.authority_revoke_outcomes"), originalProof);
  assert.throws(() => sql(revoke({ consentId: "second-consent" })), /conflict/);
  assert.throws(() => sql(revoke({ consentId: "second-consent", key: "another-revocation" })), /conflict/);
  assert.throws(() => sql(revoke({ key: "replayed" })), /replay|conflict/);
  assert.throws(() => sql(revoke({ expectedVersion: 2 })), /conflict/);
  assert.equal(sql("SELECT state FROM public.production_readiness_publications UNION ALL SELECT state FROM public.production_readiness_promotions"), "REVOKED\nREVOKED");
  assert.equal(sql("SELECT row_to_json(c) FROM public.governed_catalogs c UNION ALL SELECT row_to_json(p) FROM public.serving_products p"), retained);
  assert.equal(sql("SET SESSION AUTHORIZATION ofertasuper_authority; SELECT public.inspect_authority('activation-1','reservation-1','executor-1')->>'eligible'"), "false");
  assert.equal(sql("SELECT proof->>'state' FROM public.authority_lifecycle_outcomes"), "PROMOTED");
  assert.equal(sql("SELECT proof->>'state' FROM public.authority_revoke_outcomes"), "REVOKED");
  assert.equal(sql("SELECT count(*) FROM public.authority_revoke_audits"), "1");
  for (const table of ["authority_revoke_outcomes", "authority_revoke_audits"]) assert.throws(() => sql(`DELETE FROM public.${table}`), /immutable/);
  assert.equal(sql("SELECT has_function_privilege('public','public.revoke_authority(jsonb)','execute')"), "f");
  for (const winner of ["revoke", "activate", "duplicate", "exact"]) {
    sql(`CREATE DATABASE u11_revoke_${winner} TEMPLATE u11_revoke_template`);
    database = `u11_revoke_${winner}`;
    const first = concurrent(`BEGIN; ${winner === "activate" ? activate() : revoke()}; SELECT pg_sleep(1); COMMIT;`);
    for (let i = 0; ; i++) {
      if (sql("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event='PgSleep'") === "1") break;
      assert.ok(i < 50, "revoke contender reaches commit barrier");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const second = concurrent(winner === "revoke" ? activate() : revoke(winner === "duplicate" ? { key: "competing" } : {}));
    const results = await Promise.all([first, second]);
    assert.equal(results[0].code, 0, results[0].output);
    if (winner === "duplicate") assert.match(results[1].output, /replay|conflict/);
    else assert.equal(results[1].code, 0, results[1].output);
    assert.equal(sql("SELECT state FROM public.production_readiness_publications"), "REVOKED");
    assert.equal(sql("SELECT count(*) FROM public.authority_revoke_audits"), "1");
    assert.equal(sql("SELECT count(*) FROM public.authority_lifecycle_outcomes"), "1");
  }
  sql("CREATE DATABASE u11_revoke_route TEMPLATE u11_revoke_template");
  database = "u11_revoke_route";
  const { createAuthorityRoute } = await import("../../src/lib/production-readiness/operations");
  const handler = createAuthorityRoute("revoke", { execute, access: async () => ({ principal }) });
  const body = { key: revokeRequest.key, operationId: revokeRequest.operationId,
    reservationId: revokeRequest.reservationId, consentId: revokeRequest.consentId, expectedVersion: revokeRequest.expectedVersion };
  const send = (patch = {}) => handler(new Request("https://example.test/api/admin/catalog-authority/revoke", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://example.test", "sec-fetch-site": "same-origin" }, body: JSON.stringify({ ...body, ...patch }),
  }));
  assert.equal((await send({ consentId: "missing" })).status, 404);
  assert.deepEqual(await (await send()).json(), { operationId: "revoke-1" });
  assert.deepEqual(await (await send()).json(), { operationId: "revoke-1" });
  assert.equal((await send({ expectedVersion: 2 })).status, 409);
  assert.equal(sql("SELECT count(*) FROM public.authority_revoke_audits"), "1");
  sql("UPDATE public.publication_grants SET revoked_at=clock_timestamp() WHERE id='revoke'");
  assert.equal((await send()).status, 403);
  clone("u11_revoke_expired");
  sql(activate());
  sql("INSERT INTO public.publication_grants (id,user_id,action,scope,target,policy_digest,expires_at) SELECT 'revoke',user_id,'authority-revoke',scope,target,policy_digest,clock_timestamp()+interval '2 seconds' FROM public.publication_grants");
  const brief = await service.prepare(principal, "activation-1", "expiry");
  await service.confirm(principal, { ...brief, challengeId: brief.id, idempotencyKey: "consent", consent: true, origin: "https://example.test", fetchSite: "same-origin" });
  const blocked = concurrent(`BEGIN; SELECT * FROM public.authority_lifecycle_reservations FOR UPDATE;
    DO $$ BEGIN WHILE clock_timestamp() <= (SELECT expires_at FROM public.authority_revoke_challenges) LOOP PERFORM pg_sleep(0.02); END LOOP; END $$; COMMIT;`);
  for (let i = 0; ; i++) {
    if (sql("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event='PgSleep'") === "1") break;
    assert.ok(i < 50, "expiry blocker holds reservation before revoke");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.throws(() => sql(revoke()), /expired/);
  assert.equal((await blocked).code, 0);
  assert.equal(sql("SELECT count(*) FROM public.authority_revoke_outcomes"), "0");
  assert.equal(sql("SELECT state FROM public.production_readiness_publications"), "PROMOTED");
  // Recovery may outlive consent, but must never bypass a now-expired scoped grant.
  clone("u11_revoke_retry_expiry");
  sql(activate());
  sql("INSERT INTO public.publication_grants (id,user_id,action,scope,target,policy_digest,expires_at) SELECT 'revoke',user_id,'authority-revoke',scope,target,policy_digest,clock_timestamp()+interval '2 seconds' FROM public.publication_grants");
  const retry = await service.prepare(principal, "activation-1", "retry expiry");
  await service.confirm(principal, { ...retry, challengeId: retry.id, idempotencyKey: "consent", consent: true, origin: "https://example.test", fetchSite: "same-origin" });
  assert.equal(sql(revoke()), "revoke-1");
  sql("DO $$ BEGIN WHILE clock_timestamp() <= (SELECT expires_at FROM public.publication_grants WHERE id='revoke') LOOP PERFORM pg_sleep(0.02); END LOOP; END $$");
  assert.throws(() => sql(revoke()), /expired/);
  assert.equal(sql("SELECT count(*) FROM public.authority_revoke_audits"), "1");
});
