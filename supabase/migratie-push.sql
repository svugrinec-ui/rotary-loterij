-- ===========================================================================
--  Pushmeldingen in de loterij-app (alleen toevoegen, niets wordt verwijderd).
--  1. Herinnering om 18:00 aan leden die zich voor de clubavond hebben aangemeld
--     maar nog geen loten hebben.
--  2. "De trekking begint zo" aan iedereen die meespeelt (ook thuis).
--  Een apparaat meldt zich aan met een naam (en eventueel e-mail), zodat we het
--  kunnen koppelen aan de aanmeldingen in de club-app en aan de loten.
-- ===========================================================================

create table if not exists public.push_abonnementen (
  id            uuid primary key default gen_random_uuid(),
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  naam          text,
  email         text,
  actief        boolean not null default true,
  created_at    timestamptz not null default now(),
  bijgewerkt_op timestamptz not null default now()
);
alter table public.push_abonnementen enable row level security;
-- Bewust geen policies: alleen de server (service role) leest en schrijft.

-- Welke melding is voor welke ronde al verstuurd (zodat niets dubbel gaat).
create table if not exists public.push_meldingen (
  ronde_id     uuid not null references public.rondes(id) on delete cascade,
  soort        text not null check (soort in ('loten', 'trekking')),
  verstuurd_op timestamptz not null default now(),
  aantal       int not null default 0,
  primary key (ronde_id, soort)
);
alter table public.push_meldingen enable row level security;
