-- Direct-refresh control-plane ledger for future source-scoped cadence work.
-- This table records run metadata and artifact lineage only; it does not authorize
-- scheduler execution, repeated batches, manifest/prewrite generation, or price writes.

CREATE TYPE "DirectRefreshRunStatus" AS ENUM (
  'PLANNED',
  'RUNNING',
  'STOPPED',
  'FAILED',
  'COMPLETED'
);

CREATE TABLE "direct_refresh_run_ledger" (
  "id" SERIAL NOT NULL,
  "run_key" TEXT NOT NULL,
  "source_slug" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "attempt_id" TEXT NOT NULL,
  "source_lock_key" INTEGER NOT NULL,
  "issue_url" TEXT NOT NULL,
  "issue_number" INTEGER NOT NULL,
  "issue_title" TEXT NOT NULL,
  "issue_type_label" TEXT NOT NULL,
  "issue_approval_label" TEXT NOT NULL,
  "status" "DirectRefreshRunStatus" NOT NULL DEFAULT 'PLANNED',
  "artifact_root" TEXT NOT NULL,
  "lineage" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "planned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "last_heartbeat_at" TIMESTAMP(3),
  "stop_reason" TEXT,
  "error_summary" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "direct_refresh_run_ledger_count_check" CHECK ("count" IN (10, 25, 50)),
  CONSTRAINT "direct_refresh_run_ledger_source_check" CHECK ("source_slug" <> 'dia'),
  CONSTRAINT "direct_refresh_run_ledger_attempt_check" CHECK (length(trim("attempt_id")) > 0),
  CONSTRAINT "direct_refresh_run_ledger_artifact_root_check" CHECK (length(trim("artifact_root")) > 0),
  CONSTRAINT "direct_refresh_run_ledger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "direct_refresh_run_ledger_run_key_key"
  ON "direct_refresh_run_ledger" ("run_key");

CREATE UNIQUE INDEX "direct_refresh_run_ledger_source_slug_attempt_id_key"
  ON "direct_refresh_run_ledger" ("source_slug", "attempt_id");

CREATE INDEX "direct_refresh_run_ledger_source_slug_status_idx"
  ON "direct_refresh_run_ledger" ("source_slug", "status");

CREATE UNIQUE INDEX "direct_refresh_run_ledger_one_active_source_key"
  ON "direct_refresh_run_ledger" ("source_slug")
  WHERE "status" IN ('PLANNED', 'RUNNING');

CREATE INDEX "direct_refresh_run_ledger_issue_number_idx"
  ON "direct_refresh_run_ledger" ("issue_number");

CREATE INDEX "direct_refresh_run_ledger_planned_at_idx"
  ON "direct_refresh_run_ledger" ("planned_at");
