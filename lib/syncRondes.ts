import { serviceClient } from './supabase';

type AvondKort = { id: string; titel: string; begin_op: string };

/**
 * Houdt de loterijrondes gelijk met de clubavonden in de club-app (platform):
 * - elke komende clubavond krijgt een ronde (naam = titel, datum = de avond),
 *   gesloten en nog zonder hoofdprijs;
 * - verandert de titel of datum, dan gaat de ronde mee (niet na de trekking);
 * - verdwijnt de activiteit, dan verdwijnt de ronde alleen als er nog geen
 *   loten en geen hoofdprijs in zitten (anders blijft hij staan);
 * - een zelf gemaakte ronde op dezelfde datum wordt gekoppeld, niet verdubbeld.
 * Bestaande loten, winnaars en afgelopen rondes worden nooit aangeraakt.
 * Met { proef: true } wordt alleen uitgerekend wat er zou gebeuren.
 */
export async function syncRondes(
  opties: { proef?: boolean; avonden?: AvondKort[] } = {},
): Promise<{ aangemaakt: number; bijgewerkt: number; verwijderd: number; plan: string[]; fout?: string }> {
  const uit = { aangemaakt: 0, bijgewerkt: 0, verwijderd: 0, plan: [] as string[] };
  const proef = !!opties.proef;
  const vandaag = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });

  let avonden: AvondKort[];
  if (opties.avonden) {
    avonden = opties.avonden;
  } else {
    const basis = process.env.PLATFORM_URL;
    const sleutel = process.env.LOTERIJ_KOPPELSLEUTEL;
    if (!basis || !sleutel) return { ...uit, fout: 'niet-ingesteld' };
    try {
      const res = await fetch(`${basis.replace(/\/$/, '')}/koppeling/loterij?vanaf=${vandaag}`, {
        headers: { Authorization: `Bearer ${sleutel}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return { ...uit, fout: `status ${res.status}` };
      avonden = ((await res.json()) as { avonden?: AvondKort[] }).avonden ?? [];
    } catch {
      return { ...uit, fout: 'onbereikbaar' };
    }
  }

  const dag = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
  const sb = serviceClient();
  const { data: rondesData, error: leesFout } = await sb
    .from('rondes')
    .select('id, naam, maand, status, bijeenkomst_id')
    .or(`bijeenkomst_id.not.is.null,maand.gte.${vandaag}`);
  if (leesFout) return { ...uit, fout: 'rondes niet leesbaar (is de migratie gedraaid?)' };
  const rondes = (rondesData ?? []) as { id: string; naam: string; maand: string; status: string; bijeenkomst_id: string | null }[];

  for (const a of avonden) {
    const datum = dag(a.begin_op);
    const gekoppeld =
      rondes.find((r) => r.bijeenkomst_id === a.id) ??
      rondes.find((r) => !r.bijeenkomst_id && r.maand === datum && r.status !== 'getrokken');
    if (gekoppeld) {
      if (gekoppeld.status === 'getrokken') continue;
      const wijziging: Record<string, unknown> = {};
      if (gekoppeld.bijeenkomst_id !== a.id) wijziging.bijeenkomst_id = a.id;
      if (gekoppeld.naam !== a.titel) wijziging.naam = a.titel;
      if (gekoppeld.maand !== datum) wijziging.maand = datum;
      if (Object.keys(wijziging).length) {
        uit.plan.push(`bijwerken "${gekoppeld.naam}" (${gekoppeld.maand}) → ${JSON.stringify(wijziging)}`);
        const { error } = proef ? { error: null } : await sb.from('rondes').update(wijziging).eq('id', gekoppeld.id);
        if (!error) {
          uit.bijgewerkt++;
          Object.assign(gekoppeld, wijziging);
        }
      }
    } else {
      uit.plan.push(`aanmaken "${a.titel}" op ${datum} (gesloten, zonder hoofdprijs)`);
      const { error } = proef
        ? { error: null }
        : await sb.from('rondes').insert({ naam: a.titel, maand: datum, status: 'gesloten', bijeenkomst_id: a.id });
      if (!error) uit.aangemaakt++;
    }
  }

  // Activiteit verdwenen uit de club-app: lege, nog niet getrokken rondes opruimen.
  const ids = new Set(avonden.map((a) => a.id));
  for (const r of rondes) {
    if (!r.bijeenkomst_id || ids.has(r.bijeenkomst_id) || r.maand < vandaag || r.status === 'getrokken') continue;
    const [{ count: loten }, { count: prijzen }] = await Promise.all([
      sb.from('loten').select('id', { count: 'exact', head: true }).eq('ronde_id', r.id),
      sb.from('experiences').select('id', { count: 'exact', head: true }).eq('ronde_id', r.id),
    ]);
    if (!loten && !prijzen) {
      uit.plan.push(`verwijderen "${r.naam}" (${r.maand}): activiteit bestaat niet meer, ronde is leeg`);
      const { error } = proef ? { error: null } : await sb.from('rondes').delete().eq('id', r.id);
      if (!error) uit.verwijderd++;
    } else {
      uit.plan.push(`laten staan "${r.naam}" (${r.maand}): activiteit weg, maar er zijn al loten of een prijs`);
    }
  }
  return uit;
}
