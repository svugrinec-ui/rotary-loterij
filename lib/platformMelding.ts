// Meldingen voor leden gaan via de club-app: daar zijn ze ingelogd, dus de
// melding komt zeker bij de juiste persoon. De loterij-app stuurt zelf alleen
// nog naar thuisspelers (en leden die de club-app nog niet gebruiken).

export interface Bereikt {
  naam: string;
  email: string;
}

export async function meldViaClubApp(
  bericht:
    | { soort: 'loten'; leden: { naam: string; email: string }[] }
    | { soort: 'trekking'; deelnemers: { naam: string; contact: string | null }[] }
    | { soort: 'thuis'; bijeenkomst_id: string; deelnemers: { naam: string; contact: string | null }[] },
): Promise<Bereikt[]> {
  const basis = process.env.PLATFORM_URL;
  const sleutel = process.env.LOTERIJ_KOPPELSLEUTEL;
  if (!basis || !sleutel) return [];
  try {
    const res = await fetch(`${basis.replace(/\/$/, '')}/koppeling/loterij/melding`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sleutel}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(bericht),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn('Club-app melding: status', res.status);
      return [];
    }
    return ((await res.json()) as { bereikt?: Bereikt[] }).bereikt ?? [];
  } catch (e) {
    console.warn('Club-app melding mislukt:', (e as Error).message);
    return [];
  }
}
