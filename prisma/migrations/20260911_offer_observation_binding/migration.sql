-- CMVP04 B3: bind each offer to the instant a guarded source observation
-- produced its values. Nullable and additive only: existing rows keep NULL
-- and stay unproven until a guarded write observes them.
ALTER TABLE "supermarket_products" ADD COLUMN "observed_at" TIMESTAMP(3);
