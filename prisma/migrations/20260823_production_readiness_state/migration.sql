-- Production-readiness control-plane state starts unverified and pending.
-- This migration intentionally backfills no historical promotion, receipt, or publication.

CREATE TYPE "ProductionReadinessState" AS ENUM ('PENDING', 'BLOCKED', 'PROMOTED', 'ROLLED_BACK');
CREATE TYPE "ProductionReadinessReceiptKind" AS ENUM ('PROVENANCE', 'AUTHORIZATION', 'ALERT', 'RESTORE', 'OWNERSHIP');

CREATE TABLE "production_readiness_promotions" (
  "id" TEXT NOT NULL,
  "candidate_digest" TEXT NOT NULL,
  "deployment_id" TEXT NOT NULL,
  "commit_sha" TEXT NOT NULL,
  "owner" TEXT NOT NULL,
  "rollback_authority" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "state" "ProductionReadinessState" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "production_readiness_promotions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "production_readiness_receipts" (
  "id" TEXT NOT NULL,
  "promotion_id" TEXT NOT NULL,
  "kind" "ProductionReadinessReceiptKind" NOT NULL,
  "payload_digest" TEXT NOT NULL,
  "signer" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "state" "ProductionReadinessState" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "production_readiness_receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "production_readiness_publications" (
  "id" TEXT NOT NULL,
  "promotion_id" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "state" "ProductionReadinessState" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "production_readiness_publications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "production_readiness_promotions_candidate_digest_key" ON "production_readiness_promotions"("candidate_digest");
CREATE UNIQUE INDEX "production_readiness_receipts_promotion_id_kind_payload_digest_key" ON "production_readiness_receipts"("promotion_id", "kind", "payload_digest");
CREATE UNIQUE INDEX "production_readiness_publications_promotion_id_target_key" ON "production_readiness_publications"("promotion_id", "target");
CREATE INDEX "production_readiness_promotions_state_expires_at_idx" ON "production_readiness_promotions"("state", "expires_at");
CREATE INDEX "production_readiness_receipts_state_expires_at_idx" ON "production_readiness_receipts"("state", "expires_at");
CREATE INDEX "production_readiness_publications_state_idx" ON "production_readiness_publications"("state");

ALTER TABLE "production_readiness_receipts" ADD CONSTRAINT "production_readiness_receipts_promotion_id_fkey"
  FOREIGN KEY ("promotion_id") REFERENCES "production_readiness_promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_readiness_publications" ADD CONSTRAINT "production_readiness_publications_promotion_id_fkey"
  FOREIGN KEY ("promotion_id") REFERENCES "production_readiness_promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
