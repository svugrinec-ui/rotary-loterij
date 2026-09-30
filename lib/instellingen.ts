import { cache } from 'react';
import { serviceClient } from './supabase';
import type { Instellingen } from './types';
import type { BetaalLinks } from './bundels';

// Standaardteksten voor de export-mail (gebruikt als de instelling leeg is).
export const MAIL_INTRO_STANDAARD =
  'Hierbij het financiële overzicht van de loterij. De volledige details vind je in het bijgevoegde Excel-bestand.';
export const MAIL_AFSLUITING_STANDAARD = 'Met vriendelijke groet,\nDe loterijcommissie';

// Terugval zolang er in beheer nog geen clubnaam is ingevuld.
export const CLUBNAAM_STANDAARD = 'Rotary Club';

// Leest de (enige) instellingen-rij. Server-side; de tabel is niet publiek.
// Per request gecachet: layout, pagina en metadata vragen hem allemaal op.
export const getInstellingen = cache(async (): Promise<Instellingen | null> => {
  try {
    const { data } = await serviceClient()
      .from('instellingen')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    return (data as Instellingen | null) ?? null;
  } catch {
    // Geen service-key (bijv. lokaal zonder .env): val terug op de standaard.
    return null;
  }
});

/** De clubnaam uit de instellingen, of de algemene terugval. */
export async function getClubnaam(): Promise<string> {
  const inst = await getInstellingen();
  return inst?.clubnaam?.trim() || CLUBNAAM_STANDAARD;
}

/** Alleen de betaallinks — veilig om aan de client (meedoen-pagina) door te geven. */
export async function getBetaalLinks(): Promise<BetaalLinks> {
  const inst = await getInstellingen();
  return inst?.betaallinks ?? {};
}
