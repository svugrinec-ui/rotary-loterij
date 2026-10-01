import { serviceClient } from './supabase';
import { isDemo } from './demo';
import { syncRondes } from './syncRondes';

// Zet de testversie van de loterij terug naar de voorbeeldinhoud: een paar
// getrokken rondes met winnaars, goede doelen, en een open ronde (de eerstvolgende
// clubavond van de demo-club) met prijzen en verkochte loten. Werkt alleen in
// demo-modus, dus nooit op de echte loterijdata.

const ymd = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
const maandEerste = (terug: number) => {
  const d = new Date();
  return ymd(new Date(d.getFullYear(), d.getMonth() - terug, 1, 12));
};

const KOPERS = [
  'Pieter Verhoeven', 'Sanne Mulder', 'Margriet Kuipers', 'Kees van Leeuwen', 'Ingrid Postma',
  'Hendrik Brouwer', 'Marloes Dekker', 'Bram Jacobs', 'Ellen van Vliet', 'Arjan de Graaf',
  'Johan Smit', 'Thomas Wouters',
];

async function leegMap(map: string) {
  const sb = serviceClient();
  const { data } = await sb.storage.from('fotos').list(map, { limit: 1000 });
  const bestanden: string[] = [];
  for (const item of data ?? []) {
    if (item.id) bestanden.push(`${map}/${item.name}`);
    else await leegMap(`${map}/${item.name}`);
  }
  if (bestanden.length) await sb.storage.from('fotos').remove(bestanden);
}

async function ok<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

export async function zetDemoTerug(): Promise<{ sync: string }> {
  if (!isDemo) throw new Error('Alleen in de testversie.');
  const sb = serviceClient();
  const alles = '00000000-0000-0000-0000-000000000000';

  for (const tabel of ['trekking_live', 'loten', 'experiences', 'winnaars']) {
    await ok(sb.from(tabel).delete().neq(tabel === 'trekking_live' ? 'ronde_id' : 'id', alles));
  }
  await ok(sb.from('rondes').delete().neq('id', alles));
  await ok(sb.from('doelen').delete().neq('id', alles));
  await leegMap('loterij-demo');

  await ok(
    sb.from('instellingen').upsert({
      id: 1,
      clubnaam: 'Rotary Club Demostad',
      penningmeester_naam: 'Gerard Hoekstra',
      penningmeester_email: 'penningmeester@demostad.example',
      afzender: 'Loterij Demostad <loterij@demostad.example>',
      mail_intro: null,
      mail_afsluiting: null,
      betaallinks: {}, // demo: nooit echte betaallinks
    }),
  );

  // Goede doelen
  await ok(
    sb.from('doelen').insert([
      { naam: 'Jeugdfonds Demostad', omschrijving: 'Kinderen laten sporten en muziek maken.', opbrengst: 1240, jaar: new Date().getFullYear(), maand: maandEerste(0), sort: 0 },
      { naam: 'Voedselbank Demostad', omschrijving: 'Kerstpakketten voor gezinnen in de regio.', opbrengst: 860, jaar: new Date().getFullYear(), maand: maandEerste(1), sort: 1 },
      { naam: 'Waterproject Kenia', omschrijving: 'Schoon drinkwater voor een dorpsschool.', opbrengst: 1475, jaar: new Date().getFullYear(), maand: maandEerste(2), sort: 2 },
    ]),
  );

  // Getrokken rondes van de afgelopen maanden, met winnaars.
  const verleden = [
    { terug: 1, prijs: 'Zeilen op het IJsselmeer', aanbieder: 'Kees van Leeuwen', winnaar: 'Marloes Dekker', opbrengst: 385, tekst: 'Een zonnige dag op het water, met lunch aan boord.' },
    { terug: 2, prijs: 'Kookworkshop bij Hotel De Linde', aanbieder: 'Kees van Leeuwen', winnaar: 'Bram Jacobs', opbrengst: 420, tekst: 'Samen met de chef een driegangendiner gemaakt.' },
    { terug: 3, prijs: 'Rondleiding achter de schermen van de schouwburg', aanbieder: 'Mirjam Kok', winnaar: 'Ingrid Postma', opbrengst: 355, tekst: 'Van de toneelzolder tot de kleedkamers.' },
  ];
  for (const v of verleden) {
    const [ronde] = await ok(
      sb.from('rondes').insert({ naam: `Loterij ${v.prijs}`, maand: maandEerste(v.terug), status: 'getrokken', opbrengst: v.opbrengst }).select('id'),
    );
    await ok(
      sb.from('winnaars').insert({
        ronde_id: ronde.id,
        maand: maandEerste(v.terug),
        naam: v.winnaar,
        experience_titel: v.prijs,
        toelichting: v.tekst,
        aanbieder: v.aanbieder,
        opbrengst: v.opbrengst,
      }),
    );
  }

  // Komende clubavonden uit de demo-club (via de koppeling); lukt dat niet,
  // dan zelf drie rondes op de komende dinsdagen.
  const sync = await syncRondes();
  let { data: komend } = await sb
    .from('rondes')
    .select('id, maand')
    .gte('maand', ymd(new Date()))
    .order('maand')
    .limit(1);
  if (!komend?.length) {
    const nu = new Date();
    const totDinsdag = (2 - nu.getDay() + 7) % 7 || 7;
    const rijen = [0, 1, 2].map((w) => ({
      naam: 'Clubavond',
      maand: ymd(new Date(nu.getTime() + (totDinsdag + w * 7) * 864e5)),
      status: 'gesloten',
    }));
    komend = await ok(sb.from('rondes').insert(rijen).select('id, maand').order('maand').limit(1));
  }

  // De eerstvolgende ronde is open, met prijzen en al wat verkochte loten.
  const open = komend[0];
  await ok(sb.from('rondes').update({ status: 'open' }).eq('id', open.id));
  await ok(
    sb.from('experiences').insert([
      { ronde_id: open.id, titel: 'Golfles met de pro', omschrijving: 'Een uur les op de Demostadse golfbaan.', aanbieder: 'Arjan de Graaf', sort: 0 },
      { ronde_id: open.id, titel: 'Wijnproeverij voor vier', omschrijving: 'Een avond proeven met een sommelier.', aanbieder: 'Hendrik Brouwer', sort: 1 },
      { ronde_id: open.id, titel: 'Fietstocht met picknick', omschrijving: 'Inclusief e-bikes van Jacobs Fietsen.', aanbieder: 'Bram Jacobs', sort: 2 },
    ]),
  );
  const loten = KOPERS.flatMap((naam, i) =>
    Array.from({ length: (i % 3) + 1 }, () => ({ naam, betaald: i % 4 !== 3, betaalwijze: i % 5 === 0 ? 'cash' : 'bank' })),
  ).map((l, i) => ({
    ronde_id: open.id,
    lotnummer: i + 1,
    naam: l.naam,
    contact: null,
    betaald: l.betaald,
    betaald_op: l.betaald ? new Date().toISOString() : null,
    betaalwijze: l.betaalwijze,
    bedrag: 5,
  }));
  await ok(sb.from('loten').insert(loten));
  const betaald = loten.filter((l) => l.betaald).length * 5;
  await ok(sb.from('rondes').update({ opbrengst: betaald }).eq('id', open.id));

  return { sync: sync.fout ? `koppeling: ${sync.fout}` : `koppeling: ${sync.aangemaakt} rondes` };
}
