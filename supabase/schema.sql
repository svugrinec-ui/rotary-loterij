-- ===========================================================================
--  Rotary Experiences loterij — databaseschema (Supabase / PostgreSQL)
--  Draai dit één keer in de Supabase SQL-editor van je project.
-- ===========================================================================

-- Rondes: één loterijronde, meestal per maand of kwartaal.
create table if not exists public.rondes (
  id          uuid primary key default gen_random_uuid(),
  naam        text not null,                       -- bijv. "Juli 2026"
  maand       date not null,                       -- eerste van de maand
  status      text not null default 'open'
                check (status in ('open', 'gesloten', 'getrokken')),
  lotprijs    numeric(8,2) not null default 5.00,  -- prijs per lot in euro's
  opbrengst   numeric not null default 0,          -- som van de betaalde loten
  created_at  timestamptz not null default now()
);

-- Experiences: de te winnen ervaringen binnen een ronde.
create table if not exists public.experiences (
  id           uuid primary key default gen_random_uuid(),
  ronde_id     uuid not null references public.rondes(id) on delete cascade,
  titel        text not null,                      -- bijv. "Golf Experience met Stephen"
  omschrijving text,
  aanbieder    text,                               -- welk lid biedt dit aan
  sort         int not null default 0,
  created_at   timestamptz not null default now()
);

-- Loten: de digitale vervanging van de papieren lootjes.
create table if not exists public.loten (
  id          uuid primary key default gen_random_uuid(),
  ronde_id    uuid not null references public.rondes(id) on delete cascade,
  lotnummer   int not null,                        -- oplopend per ronde
  naam        text not null,                       -- naam van de koper
  contact     text,                                -- optioneel: e-mail of telefoon
  betaald     boolean not null default false,      -- door commissie afgevinkt
  betaald_op  timestamptz,
  betaalwijze text not null default 'bank'          -- 'bank' of 'cash'
                check (betaalwijze in ('bank', 'cash')),
  created_at  timestamptz not null default now(),
  unique (ronde_id, lotnummer)
);

-- Winnaars: de publieke galerij van gewonnen experiences.
create table if not exists public.winnaars (
  id               uuid primary key default gen_random_uuid(),
  ronde_id         uuid references public.rondes(id) on delete set null,
  maand            date not null,
  naam             text not null,                  -- naam van de winnaar
  experience_titel text not null,                  -- welke ervaring
  toelichting      text,                           -- kort verhaaltje bij de foto
  foto_url         text,                           -- eerste foto (Supabase Storage URL)
  foto_urls        text[] not null default '{}',   -- alle foto's, op volgorde (carrousel)
  gepubliceerd     boolean not null default true,
  created_at       timestamptz not null default now()
);

-- Goede doelen: waar de opbrengst naartoe gaat.
create table if not exists public.doelen (
  id           uuid primary key default gen_random_uuid(),
  naam         text not null,
  omschrijving text,
  opbrengst    numeric(10,2) not null default 0,   -- totaal opgehaald voor dit doel
  jaar         int,
  sort         int not null default 0,
  created_at   timestamptz not null default now()
);

-- Instellingen: één rij met clubnaam, betaallinks, penningmeester en mail-afzender.
create table if not exists public.instellingen (
  id                   int primary key default 1 check (id = 1),
  penningmeester_naam  text,
  penningmeester_email text,
  afzender             text,
  mail_intro           text,
  mail_afsluiting      text,
  clubnaam             text,                          -- bijv. "Rotary Club Soest-Baarn"
  betaallinks          jsonb not null default '{}',   -- per bundelbedrag: {"5": {"link": "…"}}
  updated_at           timestamptz not null default now()
);
insert into public.instellingen (id) values (1) on conflict (id) do nothing;

-- --- Indexen -------------------------------------------------------------
create index if not exists loten_ronde_idx    on public.loten (ronde_id);
create index if not exists exp_ronde_idx      on public.experiences (ronde_id);
create index if not exists winnaars_maand_idx on public.winnaars (maand desc);

-- ===========================================================================
--  Row Level Security
--  Publiek (anon-key) mag ALLEEN lezen wat publiek hoort te zijn.
--  Alle schrijfacties lopen server-side via de service-role key achter het
--  commissie-wachtwoord, en omzeilen RLS. Er zijn dus geen write-policies.
-- ===========================================================================
alter table public.rondes      enable row level security;
alter table public.experiences enable row level security;
alter table public.loten       enable row level security;
alter table public.winnaars    enable row level security;
alter table public.doelen      enable row level security;
alter table public.instellingen enable row level security; -- geen select-policy: alleen server-side

-- Gepubliceerde winnaars: openbaar leesbaar.
drop policy if exists "winnaars publiek leesbaar" on public.winnaars;
create policy "winnaars publiek leesbaar" on public.winnaars
  for select using (gepubliceerd = true);

-- Goede doelen: openbaar leesbaar.
drop policy if exists "doelen publiek leesbaar" on public.doelen;
create policy "doelen publiek leesbaar" on public.doelen
  for select using (true);

-- Lopende ronde + bijbehorende experiences: openbaar leesbaar,
-- zodat de meedoen-pagina achter de QR kan tonen wat er te winnen is.
-- Rondes zijn publiek leesbaar: de goede-doelen-pagina en de homepage-meter
-- tellen de afgesloten rondes. Loten blijven privé (geen select-policy).
drop policy if exists "open rondes leesbaar" on public.rondes;
drop policy if exists "rondes publiek leesbaar" on public.rondes;
create policy "rondes publiek leesbaar" on public.rondes
  for select using (true);

drop policy if exists "experiences van open rondes leesbaar" on public.experiences;
create policy "experiences van open rondes leesbaar" on public.experiences
  for select using (
    exists (select 1 from public.rondes r
            where r.id = experiences.ronde_id and r.status = 'open')
  );

-- LET OP: de tabel `loten` heeft géén select-policy. Zonder policy en met RLS
-- aan kan de anon-key er niets uit lezen. De inschrijving en het afvinken
-- lopen volledig via de server (service-role).

-- ===========================================================================
--  Storage bucket voor winnaarsfoto's (publiek leesbaar, upload via server).
--  Alternatief: maak de bucket 'fotos' handmatig aan in de Storage-UI.
-- ===========================================================================
insert into storage.buckets (id, name, public)
  values ('fotos', 'fotos', true)
  on conflict (id) do nothing;
