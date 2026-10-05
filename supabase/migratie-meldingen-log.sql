-- ===========================================================================
--  Logboek van verstuurde loterijmeldingen (alleen toevoegen, niets verwijderd).
--  Zo ziet de commissie op de avond wat er al is verstuurd ("18:00 automatisch
--  naar 6 leden · 19:15 handmatig naar 4") en stuurt niemand dubbel.
-- ===========================================================================
create table if not exists public.meldingen_log (
  id           uuid primary key default gen_random_uuid(),
  ronde_id     uuid not null references public.rondes(id) on delete cascade,
  soort        text not null,           -- 'loten' (nog geen lot) of 'trekking'
  handmatig    boolean not null default false,
  aantal       int not null default 0,  -- leden/telefoons bereikt
  verstuurd_op timestamptz not null default now()
);
create index if not exists meldingen_log_ronde_idx on public.meldingen_log (ronde_id, verstuurd_op);
alter table public.meldingen_log enable row level security;
-- Bewust geen policies: alleen de server (service role) leest en schrijft.
