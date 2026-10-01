-- Local CMVP bootstrap grants only the app's catalog and ingestion processing boundary.
REVOKE CREATE ON SCHEMA public FROM PUBLIC, ofertasuper_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, ofertasuper_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, ofertasuper_app;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, ofertasuper_app;
GRANT USAGE ON SCHEMA public TO ofertasuper_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.products, public.supermarkets, public.supermarket_products, public.price_history, public.promotions, public.promotion_products, public.categories, public.ingestion_run, public.staging_product, public.source_health, public.direct_refresh_run_ledger TO ofertasuper_app;
GRANT USAGE, SELECT ON SEQUENCE public.supermarkets_id_seq, public.supermarket_products_id_seq, public.price_history_id_seq, public.promotions_id_seq, public.categories_id_seq, public.ingestion_run_id_seq, public.staging_product_id_seq, public.source_health_id_seq TO ofertasuper_app;
