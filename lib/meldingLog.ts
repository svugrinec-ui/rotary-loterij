import { serviceClient } from './supabase';

export interface LogRegel {
  soort: string;
  handmatig: boolean;
  aantal: number;
  verstuurd_op: string;
}

/** Vastleggen dat er een melding is verstuurd (lukt dat niet, dan gaat het versturen gewoon door). */
export async function logMelding(rondeId: string, soort: 'loten' | 'trekking', handmatig: boolean, aantal: number) {
  try {
    await serviceClient().from('meldingen_log').insert({ ronde_id: rondeId, soort, handmatig, aantal });
  } catch {
    /* logboek is een hulpmiddel, geen voorwaarde */
  }
}

export async function leesLog(rondeId: string, soort?: 'loten' | 'trekking'): Promise<LogRegel[]> {
  try {
    let q = serviceClient()
      .from('meldingen_log')
      .select('soort, handmatig, aantal, verstuurd_op')
      .eq('ronde_id', rondeId)
      .order('verstuurd_op', { ascending: true });
    if (soort) q = q.eq('soort', soort);
    const { data, error } = await q;
    return error ? [] : ((data as LogRegel[] | null) ?? []);
  } catch {
    return [];
  }
}

const tijd = (iso: string) =>
  new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' }).format(new Date(iso));

/** "18:00 automatisch naar 6 · 19:15 handmatig naar 4" (alleen van vandaag). */
export function logTekst(regels: LogRegel[]): string | null {
  const vandaag = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
  const vanVandaag = regels.filter(
    (r) => new Date(r.verstuurd_op).toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' }) === vandaag,
  );
  if (vanVandaag.length === 0) return null;
  return vanVandaag
    .map((r) => `${tijd(r.verstuurd_op)} ${r.handmatig ? 'handmatig' : 'automatisch'} naar ${r.aantal}`)
    .join(' · ');
}
