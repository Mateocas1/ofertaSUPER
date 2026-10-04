-- #568: Coto joins the daily refresh. It is not a VTEX store (it is read
-- through its own Constructor.io search), so its row is is_vtex = false.
-- Idempotent: an existing Coto row is only re-activated.

INSERT INTO public.supermarkets (name, slug, logo_url, base_url, is_vtex, is_active)
VALUES ('Coto', 'coto', 'https://logo.clearbit.com/coto.com.ar', 'https://www.coto.com.ar', false, true)
ON CONFLICT (slug) DO UPDATE SET is_vtex = false, is_active = true, base_url = EXCLUDED.base_url;
