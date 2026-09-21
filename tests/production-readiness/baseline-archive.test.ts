import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
	createBaselineArchiveProcedureSql,
	createBaselineArchiveSchemaSql,
} from "../../src/lib/production-readiness/projection";

const migrationPath = "prisma/migrations/20260827_baseline_abandon_archive_cleanup/migration.sql";
const container = process.env.U11_PG_CONTAINER;
function sql(statement: string) {
	return execFileSync("docker", ["exec", "-i", container!, "psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "u11_baseline"], {
		input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
	}).trim();
}

describe("abandoned baseline archive and cleanup", () => {
	it("fences old epochs and invalidates seals, challenges, and approvals", () => {
		const sql = createBaselineArchiveProcedureSql();

		assert.match(sql, /governed_catalog_abandon_baseline/);
		assert.match(sql, /"build_epoch" = "build_epoch" \+ 1/);
		assert.match(sql, /"archive_required" = TRUE/);
		assert.match(sql, /"invalidated_at" = clock_timestamp\(\)/);
	});

	it("requires exact canonical archive proof before bounded cleanup can reach EMPTY", () => {
		const sql = createBaselineArchiveProcedureSql();

		assert.match(sql, /governed_catalog_seal_baseline_archive/);
		assert.match(sql, /digest\(p_canonical_bytes, 'sha256'\)/);
		assert.match(sql, /archive hash, length, or count proof failed/);
		assert.match(sql, /governed_catalog_cleanup_abandoned_baseline/);
		assert.match(sql, /FOR UPDATE SKIP LOCKED/);
		assert.match(sql, /baseline archive is not proven/);
		assert.match(sql, /"state" = 'EMPTY'/);
	});

	it("deletes abandoned serving projection rows before the catalog becomes reusable", () => {
		const sql = readFileSync(migrationPath, "utf8");
		const cleanup = sql.slice(sql.indexOf("CREATE FUNCTION public.governed_catalog_cleanup_abandoned_baseline"));

		for (const table of ["serving_memberships", "serving_history", "serving_offers", "serving_promotions", "serving_supermarkets", "serving_products"])
			assert.match(cleanup, new RegExp(`DELETE FROM public\\.${table}`));
		assert.ok(cleanup.indexOf("DELETE FROM public.serving_products") < cleanup.indexOf('"state" = \'EMPTY\''));
	});

	it("stores bounded archive chunks and resumable cleanup progress separately", () => {
		const sql = createBaselineArchiveSchemaSql();

		assert.match(sql, /baseline_archive_chunks/);
		assert.match(sql, /"canonical_bytes" BYTEA NOT NULL/);
		assert.match(sql, /baseline_archive_receipts/);
		assert.match(sql, /baseline_cleanup_progress/);
	});

	it("PostgreSQL cleanup removes serving rows and permits a clean baseline restart", { skip: !container }, () => {
		execFileSync("docker", ["exec", container!, "createdb", "-U", "postgres", "-T", "u11_template", "u11_baseline"]);
		sql(`INSERT INTO public.governed_catalogs (id,state,build_epoch,active_build_attempt_id) VALUES ('catalog','FROZEN',0,'abandoned');
			INSERT INTO public.baseline_build_attempts (id,epoch,status,deadline_at,expected_row_count,uploaded_row_count) VALUES ('abandoned',0,'FROZEN',clock_timestamp()+interval '1 hour',0,0);
			INSERT INTO public.catalog_operations VALUES ('operation','begin_baseline','abandoned-key','{}','sha256:operation','PENDING');
			INSERT INTO public.serving_products (ean,name,content_digest,last_operation_id) VALUES ('123','discarded','digest','operation');
			SELECT public.governed_catalog_abandon_baseline('abandoned',0);
			SELECT public.governed_catalog_archive_baseline_chunk('abandoned',0,0,'[]',0);
			SELECT public.governed_catalog_seal_baseline_archive('abandoned',0,'[]','4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',2,0);
			SELECT public.governed_catalog_cleanup_abandoned_baseline('abandoned',0,10);`);
		assert.equal(sql("SELECT count(*) FROM public.serving_products"), "0");
		assert.equal(sql("SELECT public.governed_catalog_begin_baseline('next','next-key','{}','sha256:next',1,0,clock_timestamp()+interval '1 hour') IS NOT NULL"), "t");
	});
});
