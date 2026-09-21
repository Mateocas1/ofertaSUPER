-- Local CMVP bootstrap grants only the app's catalog and ingestion processing boundary.
REVOKE CREATE ON SCHEMA public FROM PUBLIC, ofertasuper_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, ofertasuper_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, ofertasuper_app;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, ofertasuper_app;
REVOKE EXECUTE ON FUNCTION public.create_approval_challenge(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, ofertasuper_app, ofertasuper_runtime, ofertasuper_verifier;
GRANT EXECUTE ON FUNCTION public.create_approval_challenge(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO ofertasuper_authority;
REVOKE EXECUTE ON FUNCTION public.consume_approval_challenge(TEXT) FROM PUBLIC, ofertasuper_app, ofertasuper_runtime, ofertasuper_verifier;
GRANT EXECUTE ON FUNCTION public.consume_approval_challenge(TEXT) TO ofertasuper_authority;
REVOKE EXECUTE ON FUNCTION public.record_candidate_approval_receipt(TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC, ofertasuper_app, ofertasuper_runtime, ofertasuper_verifier;
GRANT EXECUTE ON FUNCTION public.record_candidate_approval_receipt(TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT) TO ofertasuper_authority;
REVOKE EXECUTE ON FUNCTION public.prepare_authority_revoke_consent(JSONB) FROM PUBLIC, ofertasuper_app, ofertasuper_runtime, ofertasuper_verifier;
GRANT EXECUTE ON FUNCTION public.prepare_authority_revoke_consent(JSONB) TO ofertasuper_authority;
REVOKE EXECUTE ON FUNCTION public.record_authority_revoke_consent(JSONB) FROM PUBLIC, ofertasuper_app, ofertasuper_runtime, ofertasuper_verifier;
GRANT EXECUTE ON FUNCTION public.record_authority_revoke_consent(JSONB) TO ofertasuper_authority;
GRANT USAGE ON SCHEMA public TO ofertasuper_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.products, public.supermarkets, public.supermarket_products, public.price_history, public.promotions, public.promotion_products, public.categories, public.ingestion_run, public.staging_product, public.source_health, public.direct_refresh_run_ledger TO ofertasuper_app;
GRANT USAGE, SELECT ON SEQUENCE public.supermarkets_id_seq, public.supermarket_products_id_seq, public.price_history_id_seq, public.promotions_id_seq, public.categories_id_seq, public.ingestion_run_id_seq, public.staging_product_id_seq, public.source_health_id_seq TO ofertasuper_app;
