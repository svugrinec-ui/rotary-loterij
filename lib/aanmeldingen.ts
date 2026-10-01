// Koppeling met de club-app (platform): wie heeft zich aangemeld voor een
// clubavond? Zo ziet de loterijcommissie wie nog geen lot heeft.
// Nodig: PLATFORM_URL (bv. https://www.rotarysoestbaarn.nl) en dezelfde geheime
// LOTERIJ_KOPPELSLEUTEL als in het platform.

export interface Avond {
  id: string;
  titel: string;
  begin_op: string;
  leden: { naam: string; email: string }[];
}

export async function haalAvonden(maand: string): Promise<{ avonden: Avond[]; fout?: string }> {
  const basis = process.env.PLATFORM_URL;
  const sleutel = process.env.LOTERIJ_KOPPELSLEUTEL;
  if (!basis || !sleutel) return { avonden: [], fout: 'niet-ingesteld' };
  try {
    const res = await fetch(`${basis.replace(/\/$/, '')}/koppeling/loterij?maand=${maand}`, {
      headers: { Authorization: `Bearer ${sleutel}` },
      cache: 'no-store',
    });
    if (!res.ok) return { avonden: [], fout: `status ${res.status}` };
    const data = (await res.json()) as { avonden?: Avond[] };
    return { avonden: data.avonden ?? [] };
  } catch {
    return { avonden: [], fout: 'onbereikbaar' };
  }
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9@. ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export type Status = 'meedoen' | 'controleren' | 'geen-lot';

/**
 * Vergelijkt de aangemelde leden met de deelnemers (naam + contact) van de
 * loterijronde. Zeker: volledige naam of e-mailadres komt overeen. Twijfel:
 * alleen voor- én achternaam los terug te vinden, of alleen de voornaam.
 */
export function vergelijk(
  leden: Avond['leden'],
  deelnemers: { naam: string; contact: string | null }[],
): { naam: string; status: Status; lot?: string }[] {
  const lijst = deelnemers.map((d) => ({ naam: d.naam, n: norm(d.naam), c: norm(d.contact ?? '') }));
  return leden.map((l) => {
    const naam = norm(l.naam);
    const email = norm(l.email);
    const woorden = naam.split(' ');
    const voor = woorden[0];
    const achter = woorden[woorden.length - 1];
    const zeker = lijst.find((d) => d.n === naam || (email && d.c.includes(email)));
    if (zeker) return { naam: l.naam, status: 'meedoen' as const, lot: zeker.naam };
    const twijfel =
      lijst.find((d) => d.n.split(' ').includes(voor) && d.n.split(' ').includes(achter)) ??
      lijst.find((d) => d.n.split(' ')[0] === voor);
    if (twijfel) return { naam: l.naam, status: 'controleren' as const, lot: twijfel.naam };
    return { naam: l.naam, status: 'geen-lot' as const };
  });
}
