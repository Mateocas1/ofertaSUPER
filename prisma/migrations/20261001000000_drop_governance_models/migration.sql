-- #546: drop the governance / authority / approval / sealed-generation bookkeeping.
-- Only governance objects are dropped: the catalog core (products, supermarkets,
-- supermarket_products, price_history, promotions, promotion_products, categories,
-- ingestion_run, staging_product, source_health, direct_refresh_run_ledger) is untouched.
-- Full pre-removal state is preserved in the git tag archive/full-governance.

-- Tables (their triggers, indexes and inter-governance foreign keys go with them).
DROP TABLE IF EXISTS
  "approval_challenges",
  "approval_receipts",
  "authority_candidates",
  "authority_lifecycle_audits",
  "authority_lifecycle_outcomes",
  "authority_lifecycle_reservations",
  "authority_revoke_audits",
  "authority_revoke_challenges",
  "authority_revoke_outcomes",
  "authority_revoke_receipts",
  "baseline_archive_chunks",
  "baseline_archive_receipts",
  "baseline_build_attempts",
  "baseline_build_credentials",
  "baseline_cleanup_progress",
  "baseline_cleanup_rows",
  "baseline_manifests",
  "candidate_technical_verifications",
  "catalog_operations",
  "catalog_restriction_facts",
  "catalog_restriction_surfaces",
  "delta_verifications",
  "evidence_artifacts",
  "evidence_dependencies",
  "evidence_holds",
  "evidence_measurements",
  "evidence_references",
  "evidence_restrictions",
  "evidence_retention_receipts",
  "existing_live_adoptions",
  "forward_corrective_generation_links",
  "generation_promotion_operations",
  "generation_publishing_adoptions",
  "governed_catalogs",
  "governed_generation_records",
  "production_readiness_promotions",
  "production_readiness_publications",
  "production_readiness_receipts",
  "promotion_ready_envelope_admissions",
  "promotion_ready_envelope_items",
  "publication_grants",
  "reader_generation_adoptions",
  "refresh_policies",
  "sealed_generation_delta_items",
  "sealed_generation_manifests",
  "serving_history",
  "serving_memberships",
  "serving_offers",
  "serving_products",
  "serving_promotions",
  "serving_supermarkets",
  "source_capture_items",
  "source_capture_operations",
  "verifier_envelope_commitments"
;

-- Governance-only enums.
DROP TYPE IF EXISTS "ProductionReadinessReceiptKind";
DROP TYPE IF EXISTS "ProductionReadinessState";

-- Governance procedures and trigger functions (no core table uses any of them).
DROP FUNCTION IF EXISTS public.guard_governed_catalog_mutation();
DROP FUNCTION IF EXISTS public.governed_catalog_begin_baseline(text,text,text,bigint);
DROP FUNCTION IF EXISTS public.governed_catalog_begin_baseline(text,text,text,text,bigint,bigint,timestamp with time zone);
DROP FUNCTION IF EXISTS public.governed_catalog_upload_baseline(text,bigint,bigint);
DROP FUNCTION IF EXISTS public.governed_catalog_seal_baseline(text,bigint,text,text,text,text);
DROP FUNCTION IF EXISTS public.governed_catalog_abandon_baseline(text,bigint);
DROP FUNCTION IF EXISTS public.governed_catalog_archive_baseline_chunk(text,bigint,integer,bytea,bigint);
DROP FUNCTION IF EXISTS public.governed_catalog_seal_baseline_archive(text,bigint,bytea,text,bigint,bigint);
DROP FUNCTION IF EXISTS public.governed_catalog_cleanup_abandoned_baseline(text,bigint,integer);
DROP FUNCTION IF EXISTS public.restrict_corrupt_evidence(text);
DROP FUNCTION IF EXISTS public.seal_evidence_retention(text);
DROP FUNCTION IF EXISTS public.evidence_gc(integer);
DROP FUNCTION IF EXISTS public.capture_source_delta(text,text,jsonb);
DROP FUNCTION IF EXISTS public.seal_source_verification(text,text,text,text,text,text,text,text,timestamp with time zone,timestamp with time zone);
DROP FUNCTION IF EXISTS public.record_approval_receipt(text,text,text,timestamp with time zone);
DROP FUNCTION IF EXISTS public.reject_candidate_admission_mutation();
DROP FUNCTION IF EXISTS public.resolve_eligible_candidate_admission(text);
DROP FUNCTION IF EXISTS public.reject_approval_challenge_expiry_mutation();
DROP FUNCTION IF EXISTS public.reject_approval_receipt_expiry_mutation();
DROP FUNCTION IF EXISTS public.consume_approval_challenge(text);
DROP FUNCTION IF EXISTS public.create_approval_challenge(text,text,text,text,text,text,text,timestamp with time zone,timestamp with time zone);
DROP FUNCTION IF EXISTS public.record_candidate_approval_receipt(text,text,text,timestamp with time zone,text);
DROP FUNCTION IF EXISTS public.activate_authority(jsonb);
DROP FUNCTION IF EXISTS public.inspect_authority(text,text,text);
DROP FUNCTION IF EXISTS public.authority_revoke_review(text,text);
DROP FUNCTION IF EXISTS public.prepare_authority_revoke_consent(jsonb);
DROP FUNCTION IF EXISTS public.record_authority_revoke_consent(jsonb);
DROP FUNCTION IF EXISTS public.revoke_authority(jsonb);
DROP FUNCTION IF EXISTS public.prevent_verifier_envelope_commitment_mutation();
DROP FUNCTION IF EXISTS public.canonical_json_text(jsonb);
DROP FUNCTION IF EXISTS public.envelope_items_ordered(jsonb);
DROP FUNCTION IF EXISTS public.commit_promotion_ready_envelope(bytea,text);
DROP FUNCTION IF EXISTS public.admit_promotion_ready_envelopes(jsonb);
DROP FUNCTION IF EXISTS public.prevent_promotion_ready_admission_mutation();
DROP FUNCTION IF EXISTS public.prevent_generation_foundation_mutation();
DROP FUNCTION IF EXISTS public.promote_delta(jsonb);
DROP FUNCTION IF EXISTS public.inspect_delta_promotion(jsonb);
DROP FUNCTION IF EXISTS public.prevent_existing_live_adoption_mutation();
DROP FUNCTION IF EXISTS public.adopt_existing_live(jsonb);
DROP FUNCTION IF EXISTS public.prevent_reader_generation_adoption_mutation();
DROP FUNCTION IF EXISTS public.adopt_generation(jsonb);
DROP FUNCTION IF EXISTS public.prevent_forward_corrective_generation_link_mutation();
DROP FUNCTION IF EXISTS public.link_forward_correction(jsonb);
DROP FUNCTION IF EXISTS public.guard_forward_correction_promotion();
