-- Rondes koppelen aan de clubavonden in de club-app (platform).
-- Een automatisch aangemaakte ronde onthoudt bij welke activiteit hij hoort,
-- zodat datum en naam meeverhuizen als de activiteit verandert.
-- Raakt bestaande rondes, loten en winnaars niet: alleen een extra (lege) kolom.
alter table public.rondes
  add column if not exists bijeenkomst_id uuid unique;
