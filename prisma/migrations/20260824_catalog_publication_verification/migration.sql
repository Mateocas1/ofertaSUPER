-- Verification is evidence-gated. Existing publications intentionally remain unverified.
ALTER TABLE "production_readiness_publications" ADD COLUMN "verified_at" TIMESTAMP(3);
