-- FASE 4.2: reduce WAL overhead for ephemeral staging writes.
-- This table is rebuilt from sources and has 48h retention, so crash-loss risk is acceptable.
ALTER TABLE "staging_product" SET UNLOGGED;
