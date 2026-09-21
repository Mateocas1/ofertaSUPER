-- U12b1: immutable promotion foundation only; U12b2 owns every current-projection mutation.
CREATE TABLE public.sealed_generation_manifests (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  admission_id UUID NOT NULL UNIQUE REFERENCES public.promotion_ready_envelope_admissions(id) ON DELETE RESTRICT,
  publication_id TEXT NOT NULL REFERENCES public.production_readiness_publications(id) ON DELETE RESTRICT,
  manifest_bytes BYTEA NOT NULL,
  manifest_digest TEXT NOT NULL UNIQUE CHECK (manifest_digest ~ '^sha256:[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  UNIQUE (id, admission_id)
);

CREATE TABLE public.sealed_generation_delta_items (
  manifest_id UUID NOT NULL, admission_id UUID NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  entity TEXT NOT NULL CHECK (entity IN ('product', 'supermarket', 'offer', 'history', 'promotion', 'membership')),
  item_key TEXT NOT NULL CHECK (length(item_key) BETWEEN 1 AND 512),
  type_identity TEXT NOT NULL,
  after_image JSONB NOT NULL,
  tombstone BOOLEAN NOT NULL,
  PRIMARY KEY (manifest_id, ordinal),
  UNIQUE (manifest_id, entity, item_key),
  FOREIGN KEY (manifest_id, admission_id) REFERENCES public.sealed_generation_manifests(id, admission_id) ON DELETE RESTRICT,
  CHECK (type_identity = entity || ':' || item_key),
  CHECK ((tombstone AND after_image = 'null'::jsonb) OR (NOT tombstone AND jsonb_typeof(after_image) = 'object'))
);

CREATE TABLE public.governed_generation_records (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  manifest_id UUID NOT NULL UNIQUE REFERENCES public.sealed_generation_manifests(id) ON DELETE RESTRICT,
  incarnation UUID NOT NULL,
  generation BIGINT NOT NULL CHECK (generation > 0),
  predecessor_generation BIGINT NOT NULL CHECK (predecessor_generation >= 0),
  predecessor_lineage TEXT NOT NULL, result_lineage TEXT NOT NULL,
  policy_digest TEXT NOT NULL, build_digest TEXT NOT NULL,
  health_version BIGINT NOT NULL CHECK (health_version >= 0),
  evidence_digest TEXT NOT NULL, audit_digest TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  UNIQUE (incarnation, generation)
);

CREATE TABLE public.generation_promotion_operations (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  request_key TEXT NOT NULL UNIQUE, request_digest TEXT NOT NULL UNIQUE,
  generation_record_id UUID NOT NULL UNIQUE REFERENCES public.governed_generation_records(id) ON DELETE RESTRICT,
  outcome JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE TABLE public.generation_publishing_adoptions (
  id UUID PRIMARY KEY, generation_record_id UUID NOT NULL UNIQUE REFERENCES public.governed_generation_records(id) ON DELETE RESTRICT,
  publication_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

CREATE FUNCTION public.prevent_generation_foundation_mutation() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$ BEGIN RAISE EXCEPTION 'generation foundation is immutable'; END $$;
CREATE TRIGGER governed_generation_record_immutable BEFORE UPDATE OR DELETE ON public.governed_generation_records
FOR EACH ROW EXECUTE FUNCTION public.prevent_generation_foundation_mutation();
CREATE TRIGGER sealed_generation_manifest_immutable BEFORE UPDATE OR DELETE ON public.sealed_generation_manifests
FOR EACH ROW EXECUTE FUNCTION public.prevent_generation_foundation_mutation();
CREATE TRIGGER sealed_generation_delta_item_immutable BEFORE UPDATE OR DELETE ON public.sealed_generation_delta_items
FOR EACH ROW EXECUTE FUNCTION public.prevent_generation_foundation_mutation();
CREATE TRIGGER generation_promotion_operation_immutable BEFORE UPDATE OR DELETE ON public.generation_promotion_operations
FOR EACH ROW EXECUTE FUNCTION public.prevent_generation_foundation_mutation();
CREATE TRIGGER generation_publishing_adoption_immutable BEFORE UPDATE OR DELETE ON public.generation_publishing_adoptions
FOR EACH ROW EXECUTE FUNCTION public.prevent_generation_foundation_mutation();

-- U12b2: the sole current-projection public-effect boundary.
CREATE OR REPLACE FUNCTION public.guard_governed_catalog_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('governed_catalog.procedure', true),'') NOT IN
    ('begin_baseline','seal_baseline','abandon_baseline','cleanup_baseline','activate_authority','promote_delta') THEN
    RAISE EXCEPTION 'governed catalog mutations require a guarded procedure';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.promote_delta(r JSONB) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  manifest public.sealed_generation_manifests%ROWTYPE; admission public.promotion_ready_envelope_admissions%ROWTYPE;
  publication public.production_readiness_publications%ROWTYPE; promotion public.production_readiness_promotions%ROWTYPE;
  candidate public.authority_candidates%ROWTYPE; catalog public.governed_catalogs%ROWTYPE;
  authority public.authority_lifecycle_outcomes%ROWTYPE; prior public.generation_promotion_operations%ROWTYPE;
  item public.sealed_generation_delta_items%ROWTYPE; checked TIMESTAMPTZ; expiry TIMESTAMPTZ; request_digest TEXT;
  record_id UUID; digest TEXT; result_lineage TEXT; proof JSONB; deletion JSONB;
  keys TEXT[] := ARRAY['key','manifestId','expectedGeneration','expectedHealthVersion'];
BEGIN
  IF session_user::text <> 'ofertasuper_authority' THEN RAISE EXCEPTION 'authority backend session required'; END IF;
  IF NOT coalesce(r ?& keys,false) OR r - keys <> '{}'::jsonb OR octet_length(r::text)>8192
    OR length(r->>'key') NOT BETWEEN 1 AND 256 OR r->>'key' !~ '^[a-zA-Z0-9:_-]+$' OR r->>'manifestId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR r->>'expectedGeneration' !~ '^(0|[1-9][0-9]*)$' OR r->>'expectedHealthVersion' !~ '^(0|[1-9][0-9]*)$' THEN
    RAISE EXCEPTION 'complete promotion request required';
  END IF;
  request_digest := 'sha256:' || encode(sha256(convert_to(public.canonical_json_text(r), 'UTF8')), 'hex');
  SELECT * INTO prior FROM public.generation_promotion_operations WHERE request_key=r->>'key' FOR UPDATE;
  IF FOUND THEN
    IF prior.request_digest <> request_digest THEN RAISE EXCEPTION 'promotion idempotency conflict'; END IF;
    RETURN prior.request_key;
  END IF;
  SELECT * INTO manifest FROM public.sealed_generation_manifests WHERE id=(r->>'manifestId')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sealed manifest required'; END IF;
  SELECT * INTO admission FROM public.promotion_ready_envelope_admissions WHERE id=manifest.admission_id FOR SHARE;
  SELECT * INTO publication FROM public.production_readiness_publications WHERE id=manifest.publication_id FOR UPDATE;
  SELECT * INTO promotion FROM public.production_readiness_promotions WHERE id=publication.promotion_id FOR SHARE;
  SELECT * INTO candidate FROM public.authority_candidates WHERE manifest_digest=promotion.candidate_digest FOR SHARE;
  SELECT * INTO authority FROM public.authority_lifecycle_outcomes WHERE publication_id=publication.id FOR SHARE;
  SELECT * INTO catalog FROM public.governed_catalogs WHERE id='catalog' FOR UPDATE;
  IF NOT FOUND OR publication.state <> 'PROMOTED' OR promotion.state <> 'PROMOTED'
    OR candidate.id IS NULL OR candidate.deployment_id <> promotion.deployment_id OR candidate.full_sha <> promotion.commit_sha
    OR candidate.target <> publication.target OR candidate.manifest_digest <> admission.candidate_digest
    OR catalog.state <> 'LIVE' OR catalog.governed_generation IS DISTINCT FROM admission.predecessor_generation
    OR catalog.authority_adoption->>'incarnation' IS DISTINCT FROM admission.incarnation::text
    OR catalog.authority_adoption->>'policyDigest' IS DISTINCT FROM admission.policy_digest
    OR catalog.authority_adoption->>'buildDigest' IS DISTINCT FROM admission.build_digest
    OR catalog.authority_adoption->>'healthVersion' IS DISTINCT FROM admission.health_version::text
    OR catalog.authority_adoption->>'lineage' IS DISTINCT FROM admission.predecessor_lineage
    OR authority.proof->'adoption'->>'policyDigest' IS DISTINCT FROM admission.policy_digest
    OR NOT EXISTS (SELECT 1 FROM public.sealed_generation_delta_items i WHERE i.manifest_id=manifest.id AND i.admission_id=admission.id)
    OR EXISTS (SELECT 1 FROM public.sealed_generation_delta_items i WHERE i.manifest_id=manifest.id AND i.admission_id<>admission.id) THEN
    RAISE EXCEPTION 'stale promotion binding';
  END IF;
  expiry := least(promotion.expires_at, candidate.expires_at, authority.expires_at);
  checked := clock_timestamp();
  IF checked >= expiry OR catalog.governed_generation <> (r->>'expectedGeneration')::bigint
    OR admission.health_version <> (r->>'expectedHealthVersion')::bigint THEN RAISE EXCEPTION 'final DB-clock promotion check failed'; END IF;
  INSERT INTO public.catalog_operations(id,action,client_key,request_bytes,operation_request_digest,status)
    VALUES (r->>'key','promote_delta',r->>'key',r::text,request_digest,'PENDING');
  -- Delete dependent sealed tombstones first; all FK checks stay deferred until the atomic commit.
  FOR item IN SELECT * FROM public.sealed_generation_delta_items WHERE manifest_id=manifest.id AND tombstone
    ORDER BY CASE entity WHEN 'membership' THEN 1 WHEN 'history' THEN 2 WHEN 'offer' THEN 3 WHEN 'promotion' THEN 4 WHEN 'supermarket' THEN 5 ELSE 6 END, ordinal LOOP
    SELECT before_image INTO deletion FROM public.promotion_ready_envelope_items WHERE admission_id=admission.id AND ordinal=item.ordinal;
    IF deletion IS NULL OR deletion='null'::jsonb THEN RAISE EXCEPTION 'tombstone before-image required'; END IF;
    IF item.entity='membership' THEN DELETE FROM public.serving_memberships WHERE promotion_id=(deletion->>'promotionId')::bigint AND product_ean=deletion->>'productEan';
    ELSIF item.entity='history' THEN DELETE FROM public.serving_history WHERE id=(deletion->>'id')::bigint;
    ELSIF item.entity='offer' THEN DELETE FROM public.serving_offers WHERE product_ean=deletion->>'productEan' AND supermarket_id=(deletion->>'supermarketId')::integer;
    ELSIF item.entity='promotion' THEN DELETE FROM public.serving_promotions WHERE id=(deletion->>'id')::bigint;
    ELSIF item.entity='supermarket' THEN DELETE FROM public.serving_supermarkets WHERE id=(deletion->>'id')::integer;
    ELSIF item.entity='product' THEN DELETE FROM public.serving_products WHERE ean=deletion->>'ean';
    END IF;
  END LOOP;
  FOR item IN SELECT * FROM public.sealed_generation_delta_items WHERE manifest_id=manifest.id AND NOT tombstone
    ORDER BY CASE entity WHEN 'product' THEN 1 WHEN 'supermarket' THEN 2 WHEN 'offer' THEN 3 WHEN 'history' THEN 4 WHEN 'promotion' THEN 5 ELSE 6 END, ordinal LOOP
    digest := 'sha256:' || encode(sha256(convert_to(public.canonical_json_text(item.after_image), 'UTF8')), 'hex');
    IF item.entity='product' THEN INSERT INTO public.serving_products VALUES (item.after_image->>'ean',item.after_image->>'name',item.after_image->>'brand',item.after_image->>'description',item.after_image->>'imageUrl',ARRAY(SELECT jsonb_array_elements_text(coalesce(item.after_image->'images','[]'))),item.after_image->>'category',digest,r->>'key') ON CONFLICT (ean) DO UPDATE SET name=EXCLUDED.name,brand=EXCLUDED.brand,description=EXCLUDED.description,image_url=EXCLUDED.image_url,images=EXCLUDED.images,category=EXCLUDED.category,content_digest=EXCLUDED.content_digest,last_operation_id=EXCLUDED.last_operation_id;
    ELSIF item.entity='supermarket' THEN INSERT INTO public.serving_supermarkets VALUES ((item.after_image->>'id')::integer,item.after_image->>'name',item.after_image->>'slug',item.after_image->>'logoUrl',item.after_image->>'baseUrl',coalesce((item.after_image->>'isVtex')::boolean,false),coalesce((item.after_image->>'isActive')::boolean,false),(item.after_image->>'freshnessSlaHours')::integer,digest,r->>'key') ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,slug=EXCLUDED.slug,logo_url=EXCLUDED.logo_url,base_url=EXCLUDED.base_url,is_vtex=EXCLUDED.is_vtex,is_active=EXCLUDED.is_active,freshness_sla_hours=EXCLUDED.freshness_sla_hours,content_digest=EXCLUDED.content_digest,last_operation_id=EXCLUDED.last_operation_id;
    ELSIF item.entity='offer' THEN INSERT INTO public.serving_offers VALUES (item.after_image->>'productEan',(item.after_image->>'supermarketId')::integer,(item.after_image->>'price')::decimal,(item.after_image->>'listPrice')::decimal,(item.after_image->>'referencePrice')::decimal,item.after_image->>'referenceUnit',coalesce((item.after_image->>'isAvailable')::boolean,false),item.after_image->>'skuId',item.after_image->>'sellerId',item.after_image->>'productUrl',(item.after_image->>'lastCheckedAt')::timestamp,digest,r->>'key') ON CONFLICT (product_ean,supermarket_id) DO UPDATE SET price=EXCLUDED.price,list_price=EXCLUDED.list_price,reference_price=EXCLUDED.reference_price,reference_unit=EXCLUDED.reference_unit,is_available=EXCLUDED.is_available,sku_id=EXCLUDED.sku_id,seller_id=EXCLUDED.seller_id,product_url=EXCLUDED.product_url,last_checked_at=EXCLUDED.last_checked_at,content_digest=EXCLUDED.content_digest,last_operation_id=EXCLUDED.last_operation_id;
    ELSIF item.entity='history' THEN INSERT INTO public.serving_history VALUES ((item.after_image->>'id')::bigint,item.after_image->>'productEan',(item.after_image->>'supermarketId')::integer,(item.after_image->>'price')::decimal,(item.after_image->>'listPrice')::decimal,(item.after_image->>'scrapedAt')::timestamp,digest,r->>'key') ON CONFLICT (id) DO UPDATE SET product_ean=EXCLUDED.product_ean,supermarket_id=EXCLUDED.supermarket_id,price=EXCLUDED.price,list_price=EXCLUDED.list_price,scraped_at=EXCLUDED.scraped_at,content_digest=EXCLUDED.content_digest,last_operation_id=EXCLUDED.last_operation_id;
    ELSIF item.entity='promotion' THEN INSERT INTO public.serving_promotions VALUES ((item.after_image->>'id')::bigint,(item.after_image->>'supermarketId')::integer,item.after_image->>'type',item.after_image->>'title',item.after_image->>'walletProvider',item.after_image->>'bankName',(item.after_image->>'discountValue')::decimal,item.after_image->>'conditions',(item.after_image->>'startDate')::timestamp,(item.after_image->>'endDate')::timestamp,coalesce((item.after_image->>'isActive')::boolean,false),digest,r->>'key') ON CONFLICT (id) DO UPDATE SET supermarket_id=EXCLUDED.supermarket_id,type=EXCLUDED.type,title=EXCLUDED.title,wallet_provider=EXCLUDED.wallet_provider,bank_name=EXCLUDED.bank_name,discount_value=EXCLUDED.discount_value,conditions=EXCLUDED.conditions,start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,is_active=EXCLUDED.is_active,content_digest=EXCLUDED.content_digest,last_operation_id=EXCLUDED.last_operation_id;
    ELSE INSERT INTO public.serving_memberships VALUES ((item.after_image->>'promotionId')::bigint,item.after_image->>'productEan',digest,r->>'key') ON CONFLICT (promotion_id,product_ean) DO UPDATE SET content_digest=EXCLUDED.content_digest,last_operation_id=EXCLUDED.last_operation_id;
    END IF;
  END LOOP;
  result_lineage := 'sha256:' || encode(sha256(convert_to('governed-lineage/v1:' || admission.predecessor_lineage || ':' || manifest.manifest_digest || ':' || admission.policy_digest, 'UTF8')), 'hex');
  INSERT INTO public.governed_generation_records(manifest_id,incarnation,generation,predecessor_generation,predecessor_lineage,result_lineage,policy_digest,build_digest,health_version,evidence_digest,audit_digest)
    VALUES(manifest.id,admission.incarnation,catalog.governed_generation+1,catalog.governed_generation,admission.predecessor_lineage,result_lineage,admission.policy_digest,admission.build_digest,admission.health_version,admission.evidence_digest,'sha256:' || encode(sha256(convert_to(r::text,'UTF8')),'hex')) RETURNING id INTO record_id;
  proof := jsonb_build_object('operationId',r->>'key','manifestId',manifest.id,'admissionId',admission.id,'publicationId',publication.id,'generation',(catalog.governed_generation+1)::text,'finalCheckedAt',checked,'expiresAt',expiry,'lineage',result_lineage,'state','PROMOTED');
  INSERT INTO public.generation_promotion_operations(id,request_key,request_digest,generation_record_id,outcome) VALUES(gen_random_uuid(),r->>'key',request_digest,record_id,proof);
  INSERT INTO public.generation_publishing_adoptions(id,generation_record_id,publication_id) VALUES(gen_random_uuid(),record_id,publication.id);
  PERFORM set_config('governed_catalog.procedure','promote_delta',true);
  UPDATE public.governed_catalogs SET governed_generation=governed_generation+1,authority_adoption=authority_adoption || jsonb_build_object('generation',(catalog.governed_generation+1)::text,'lineage',result_lineage) WHERE id='catalog';
  UPDATE public.catalog_operations SET status='PROMOTED' WHERE id=r->>'key';
  RETURN r->>'key';
END $$;
REVOKE ALL ON FUNCTION public.promote_delta(JSONB) FROM PUBLIC;
