-- ===========================================================================
--  Testversie van de loterij (demo voor de verkoop).
--  Draait in een EIGEN schema `loterij_demo` in de testdatabase van het
--  platform — nooit in de live loterijdatabase. Zelfde tabellen als
--  schema.sql + alle migraties, maar zonder echte betaallinks.
--  Idempotent: opnieuw draaien kan.
-- ===========================================================================
create schema if not exists loterij_demo;
grant usage on schema loterij_demo to anon, authenticated, service_role;

create table if not exists loterij_demo.rondes (
  id             uuid primary key default gen_random_uuid(),
  naam           text not null,
  maand          date not null,
  status         text not null default 'open' check (status in ('open', 'gesloten', 'getrokken')),
  lotprijs       numeric(8,2) not null default 5.00,
  opbrengst      numeric not null default 0,
  bijeenkomst_id uuid unique,
  created_at     timestamptz not null default now()
);

create table if not exists loterij_demo.experiences (
  id           uuid primary key default gen_random_uuid(),
  ronde_id     uuid not null references loterij_demo.rondes(id) on delete cascade,
  titel        text not null,
  omschrijving text,
  aanbieder    text,
  sort         int not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists loterij_demo.loten (
  id          uuid primary key default gen_random_uuid(),
  ronde_id    uuid not null references loterij_demo.rondes(id) on delete cascade,
  lotnummer   int not null,
  naam        text not null,
  contact     text,
  betaald     boolean not null default false,
  betaald_op  timestamptz,
  betaalwijze text not null default 'bank' check (betaalwijze in ('bank', 'cash')),
  bedrag      numeric(8,2) not null default 0,
  created_at  timestamptz not null default now(),
  unique (ronde_id, lotnummer)
);

create table if not exists loterij_demo.winnaars (
  id               uuid primary key default gen_random_uuid(),
  ronde_id         uuid references loterij_demo.rondes(id) on delete set null,
  maand            date not null,
  naam             text not null,
  experience_titel text not null,
  toelichting      text,
  foto_url         text,
  foto_urls        text[] not null default '{}',
  gepubliceerd     boolean not null default true,
  opbrengst        numeric(10,2) not null default 0,
  aanbieder        text,
  created_at       timestamptz not null default now()
);

create table if not exists loterij_demo.doelen (
  id           uuid primary key default gen_random_uuid(),
  naam         text not null,
  omschrijving text,
  opbrengst    numeric(10,2) not null default 0,
  jaar         int,
  maand        date,
  foto_url     text,
  sort         int not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists loterij_demo.instellingen (
  id                   int primary key default 1 check (id = 1),
  penningmeester_naam  text,
  penningmeester_email text,
  afzender             text,
  mail_intro           text,
  mail_afsluiting      text,
  clubnaam             text,
  betaallinks          jsonb not null default '{}',
  updated_at           timestamptz not null default now()
);

create table if not exists loterij_demo.trekking_live (
  ronde_id          uuid primary key references loterij_demo.rondes(id) on delete cascade,
  fase              text not null default 'wachten',
  prijs_label       text,
  prijs_index       int not null default 0,
  prijs_totaal      int not null default 0,
  hoofdprijs        boolean not null default false,
  winnaar_lotnummer int,
  winnaar_naam      text,
  pool_nummers      int[] not null default '{}',
  bijgewerkt_op     timestamptz not null default now()
);

create index if not exists loten_ronde_idx    on loterij_demo.loten (ronde_id);
create index if not exists exp_ronde_idx      on loterij_demo.experiences (ronde_id);
create index if not exists winnaars_maand_idx on loterij_demo.winnaars (maand desc);

-- Rechten: zoals in public (anon leest, service_role schrijft; RLS beperkt anon).
grant select on all tables in schema loterij_demo to anon, authenticated;
grant all on all tables in schema loterij_demo to service_role;

alter table loterij_demo.rondes        enable row level security;
alter table loterij_demo.experiences   enable row level security;
alter table loterij_demo.loten         enable row level security;
alter table loterij_demo.winnaars      enable row level security;
alter table loterij_demo.doelen        enable row level security;
alter table loterij_demo.instellingen  enable row level security;
alter table loterij_demo.trekking_live enable row level security;

drop policy if exists "winnaars publiek leesbaar" on loterij_demo.winnaars;
create policy "winnaars publiek leesbaar" on loterij_demo.winnaars for select using (gepubliceerd = true);
drop policy if exists "doelen publiek leesbaar" on loterij_demo.doelen;
create policy "doelen publiek leesbaar" on loterij_demo.doelen for select using (true);
drop policy if exists "rondes publiek leesbaar" on loterij_demo.rondes;
create policy "rondes publiek leesbaar" on loterij_demo.rondes for select using (true);
drop policy if exists "experiences van open rondes leesbaar" on loterij_demo.experiences;
create policy "experiences van open rondes leesbaar" on loterij_demo.experiences for select using (
  exists (select 1 from loterij_demo.rondes r where r.id = experiences.ronde_id and r.status = 'open')
);
drop policy if exists "trekking publiek leesbaar" on loterij_demo.trekking_live;
create policy "trekking publiek leesbaar" on loterij_demo.trekking_live for select using (true);

-- Realtime (maandmeter en live-trekking).
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['rondes', 'trekking_live'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'loterij_demo' and tablename = t) then
      execute format('alter publication supabase_realtime add table loterij_demo.%I', t);
    end if;
  end loop;
end $$;

-- Opslag: de bucket 'fotos' bestaat al in de platformdatabase; de demo
-- gebruikt daarin de map 'loterij-demo/'.

-- Pushmeldingen (zie migratie-push.sql); alleen de server leest en schrijft.
create table if not exists loterij_demo.push_abonnementen (
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
create table if not exists loterij_demo.push_meldingen (
  ronde_id     uuid not null references loterij_demo.rondes(id) on delete cascade,
  soort        text not null check (soort in ('loten', 'trekking')),
  verstuurd_op timestamptz not null default now(),
  aantal       int not null default 0,
  primary key (ronde_id, soort)
);
grant all on loterij_demo.push_abonnementen, loterij_demo.push_meldingen to service_role;
alter table loterij_demo.push_abonnementen enable row level security;
alter table loterij_demo.push_meldingen    enable row level security;

-- Logboek van verstuurde loterijmeldingen (zie migratie-meldingen-log.sql).
create table if not exists loterij_demo.meldingen_log (
  id           uuid primary key default gen_random_uuid(),
  ronde_id     uuid not null references loterij_demo.rondes(id) on delete cascade,
  soort        text not null,
  handmatig    boolean not null default false,
  aantal       int not null default 0,
  verstuurd_op timestamptz not null default now()
);
create index if not exists meldingen_log_ronde_idx on loterij_demo.meldingen_log (ronde_id, verstuurd_op);
grant all on loterij_demo.meldingen_log to service_role;
alter table loterij_demo.meldingen_log enable row level security;
