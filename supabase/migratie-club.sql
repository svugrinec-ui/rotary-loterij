-- Clubnaam en betaallinks instelbaar via het beheerscherm, zodat de app ook
-- voor andere clubs te gebruiken is zonder code aan te passen.
--   clubnaam    : bijv. "Rotary Club Soest-Baarn" (kop, voettekst, mail, app-naam)
--   betaallinks : per bundelbedrag een betaalverzoek-link, bijv.
--                 {"5": {"link": "https://…"}, "20": {"link": "https://…", "zelfBedrag": true}}
alter table public.instellingen
  add column if not exists clubnaam    text,
  add column if not exists betaallinks jsonb not null default '{}'::jsonb;

-- Eenmalig voor Soest-Baarn: de waarden die tot nu toe in de code stonden.
-- Overschrijft niets dat al via beheer is ingevuld.
update public.instellingen
set clubnaam = coalesce(clubnaam, 'Rotary Club Soest-Baarn'),
    betaallinks = case when betaallinks = '{}'::jsonb then '{
      "5":  {"link": "https://betaalverzoek.rabobank.nl/betaalverzoek/?id=aVc7byXLQfyDcxw9JmsplQ"},
      "10": {"link": "https://betaalverzoek.rabobank.nl/betaalverzoek/?id=6B1Z_IykSfy15-hNHlrKtA"},
      "15": {"link": "https://betaalverzoek.rabobank.nl/betaalverzoek/?id=TcZeFyANQxuPr8daSgTpBQ"},
      "20": {"link": "https://betaalverzoek.rabobank.nl/betaalverzoek/?id=WvohXnibT32TcPV_ahr1QQ", "zelfBedrag": true}
    }'::jsonb else betaallinks end
where id = 1;
