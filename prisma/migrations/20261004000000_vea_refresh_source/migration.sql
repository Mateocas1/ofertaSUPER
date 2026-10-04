-- #568: Vea (Cencosud, same VTEX platform and category tree as Disco and Jumbo)
-- joins the daily refresh. The acquisition only stages for an active VTEX
-- supermarket row, so the row must exist (and be active) in every restored
-- database. Idempotent: an existing Vea row is only re-activated.

INSERT INTO public.supermarkets (name, slug, logo_url, base_url, is_vtex, is_active)
VALUES ('Vea', 'vea', 'https://logo.clearbit.com/vea.com.ar', 'https://www.vea.com.ar', true, true)
ON CONFLICT (slug) DO UPDATE SET is_vtex = true, is_active = true;
