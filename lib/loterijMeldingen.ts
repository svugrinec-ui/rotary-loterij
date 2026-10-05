import { serviceClient } from './supabase';
import { haalAvonden, vergelijk, type Avond } from './aanmeldingen';
import { actieveAbonnementen, norm, stuurPush, type Abonnement } from './push';
import { meldViaClubApp, type Bereikt } from './platformMelding';

/** Al bereikt via de club-app? Dan niet nog eens via de loterij-app. */
const nietAlBereikt = (bereikt: Bereikt[]) => {
  const namen = new Set(bereikt.map((b) => norm(b.naam)));
  const mails = new Set(bereikt.map((b) => norm(b.email)).filter(Boolean));
  return (a: Abonnement) => !namen.has(norm(a.naam)) && !(a.email && mails.has(norm(a.email)));
};

/** Vandaag in Nederland: datum (YYYY-MM-DD) en uur. Vercel draait in UTC. */
function nuInNederland(nu: Date) {
  const d = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    })
      .formatToParts(nu)
      .map((p) => [p.type, p.value]),
  );
  return { datum: `${d.year}-${d.month}-${d.day}`, uur: Number(d.hour) };
}
const datumVan = (iso: string) => nuInNederland(new Date(iso)).datum;

/** Legt vast dat een melding voor deze ronde verstuurd is; false als dat al eerder gebeurde. */
async function claim(rondeId: string, soort: 'loten' | 'trekking'): Promise<boolean> {
  const { error } = await serviceClient().from('push_meldingen').insert({ ronde_id: rondeId, soort });
  return !error;
}

/**
 * 1. Herinnering vanaf 18:00 op de dag van de clubavond: leden die zich hebben
 *    aangemeld maar nog geen lot hebben, krijgen een melding (één keer per ronde).
 *    Alleen bij een open ronde; twijfelgevallen (naam lijkt erop) slaan we over.
 */
export async function lotenHerinnering(nu = new Date()): Promise<{ verstuurd: number; meldingen: string[] }> {
  const uit = { verstuurd: 0, meldingen: [] as string[] };
  const { datum, uur } = nuInNederland(nu);
  if (uur < 18) {
    uit.meldingen.push('nog geen 18:00');
    return uit;
  }
  const { avonden, fout } = await haalAvonden(datum.slice(0, 7));
  if (fout) uit.meldingen.push(`club-app: ${fout}`);
  const vandaag = avonden.filter((a) => datumVan(a.begin_op) === datum);
  if (vandaag.length === 0) return uit;

  const sb = serviceClient();
  const abos = await actieveAbonnementen();
  for (const avond of vandaag) {
    const { data: ronde } = await sb
      .from('rondes')
      .select('id, status')
      .eq('bijeenkomst_id', avond.id)
      .maybeSingle();
    if (!ronde || ronde.status !== 'open') continue;
    // Thuisspelers ("speel thuis mee"): de club-app beslist of dat aanstaat en stuurt het één keer per avond.
    const { data: lotenRonde } = await sb.from('loten').select('naam, contact').eq('ronde_id', ronde.id);
    const thuis = await meldViaClubApp({
      soort: 'thuis',
      bijeenkomst_id: avond.id,
      deelnemers: (lotenRonde ?? []) as { naam: string; contact: string | null }[],
    });
    if (thuis.length) uit.meldingen.push(`${avond.titel}: ${thuis.length} thuisspeler(s) via de club-app`);
    if (!(await claim(ronde.id, 'loten'))) continue;
    const { zonderLot, aantal } = await herinnerZonderLot(ronde.id, avond, abos);
    await sb.from('push_meldingen').update({ aantal }).eq('ronde_id', ronde.id).eq('soort', 'loten');
    uit.verstuurd += aantal;
    uit.meldingen.push(`${avond.titel}: ${zonderLot} zonder lot, ${aantal} melding(en)`);
  }
  return uit;
}

/** De herinnering zelf: aangemelde leden van deze avond zonder lot in deze ronde. */
export async function herinnerZonderLot(
  rondeId: string,
  avond: Avond,
  abos?: Abonnement[],
): Promise<{ zonderLot: number; aantal: number; viaClub: number; viaLoterij: number }> {
  const { data: loten } = await serviceClient().from('loten').select('naam, contact').eq('ronde_id', rondeId);
  const zonderLot = vergelijk(avond.leden, (loten ?? []) as { naam: string; contact: string | null }[])
    .filter((r) => r.status === 'geen-lot')
    .map((r) => avond.leden.find((l) => l.naam === r.naam)!)
    .filter(Boolean);
  if (zonderLot.length === 0) return { zonderLot: 0, aantal: 0, viaClub: 0, viaLoterij: 0 };
  // Eerst via de club-app (leden zijn daar ingelogd), daarna de rest via de loterij-app.
  const bereikt = await meldViaClubApp({ soort: 'loten', leden: zonderLot });
  const namen = new Set(zonderLot.map((l) => norm(l.naam)));
  const mails = new Set(zonderLot.map((l) => norm(l.email)).filter(Boolean));
  const ontvangers = (abos ?? (await actieveAbonnementen()))
    .filter((a) => namen.has(norm(a.naam)) || (!!a.email && mails.has(norm(a.email))))
    .filter(nietAlBereikt(bereikt));
  const viaLoterij = await stuurPush(ontvangers, {
    titel: 'Nog geen loten voor vanavond?',
    tekst: 'Je bent aangemeld voor de clubavond. Koop je loten vóór de trekking en maak kans op de Rotary Experience.',
    url: '/meedoen',
    tag: `loten-${rondeId}`,
  });
  return { zonderLot: zonderLot.length, aantal: bereikt.length + viaLoterij, viaClub: bereikt.length, viaLoterij };
}

/**
 * 2. "De trekking begint zo": naar iedereen die meespeelt in deze ronde (ook
 *    thuisspelers), herkend aan de naam of het e-mailadres bij de loten.
 */
export async function trekkingMelding(
  rondeId: string,
): Promise<{ aantal: number; deelnemers: number; viaClub: number; viaLoterij: number }> {
  const sb = serviceClient();
  const { data: loten } = await sb.from('loten').select('naam, contact').eq('ronde_id', rondeId);
  const lijst = (loten ?? []) as { naam: string; contact: string | null }[];
  const namen = new Set(lijst.map((l) => norm(l.naam)));
  const contacten = lijst.map((l) => norm(l.contact)).filter(Boolean);
  // Leden via de club-app; thuisspelers (en wie de club-app niet gebruikt) via de loterij-app.
  const bereikt = lijst.length ? await meldViaClubApp({ soort: 'trekking', deelnemers: lijst }) : [];
  const meespelers = (await actieveAbonnementen())
    .filter(
      (a: Abonnement) => namen.has(norm(a.naam)) || (!!a.email && contacten.some((c) => c.includes(norm(a.email)))),
    )
    .filter(nietAlBereikt(bereikt));
  const viaLoterij = await stuurPush(meespelers, {
    titel: 'De trekking begint zo! 🎟️',
    tekst: 'Pak de loterij-app erbij en kijk live mee of jouw lot valt.',
    url: '/live',
    tag: `trekking-${rondeId}`,
  });
  await sb
    .from('push_meldingen')
    .upsert({ ronde_id: rondeId, soort: 'trekking', aantal: bereikt.length + viaLoterij, verstuurd_op: new Date().toISOString() });
  return {
    aantal: bereikt.length + viaLoterij,
    deelnemers: new Set(lijst.map((l) => norm(l.naam))).size,
    viaClub: bereikt.length,
    viaLoterij,
  };
}
