import type { BetaalLinks } from './bundels';

export type RondeStatus = 'open' | 'gesloten' | 'getrokken';

export interface Ronde {
  id: string;
  naam: string;
  maand: string; // ISO date
  status: RondeStatus;
  lotprijs: number;
  opbrengst: number; // som van de betaalde loten; bijgewerkt bij afvinken/sluiten
  created_at: string;
}

export interface Experience {
  id: string;
  ronde_id: string;
  titel: string;
  omschrijving: string | null;
  aanbieder: string | null;
  sort: number;
  created_at: string;
}

export interface Lot {
  id: string;
  ronde_id: string;
  lotnummer: number;
  naam: string;
  contact: string | null;
  betaald: boolean;
  betaald_op: string | null;
  bedrag: number; // betaald bedrag voor dit lot (bundelbedrag verdeeld over de loten)
  betaalwijze: 'bank' | 'cash'; // hoe er betaald wordt
  created_at: string;
}

export interface Winnaar {
  id: string;
  ronde_id: string | null;
  maand: string; // ISO date
  naam: string;
  experience_titel: string;
  aanbieder: string | null; // wie de experience aanbood
  toelichting: string | null;
  foto_url: string | null; // eerste foto; blijft bestaan voor de compacte weergaves
  foto_urls: string[] | null; // alle foto's, op volgorde (carrousel in de galerij)
  opbrengst: number; // opbrengst voor het goede doel in deze loterijweek
  gepubliceerd: boolean;
  created_at: string;
}

/** Fase van de live trekking; de beheerder zet deze door tijdens de show. */
export type TrekkingFase = 'wachten' | 'rollen' | 'onthuld' | 'klaar';

/**
 * De stand van de trekking, één rij per ronde. De beheerder schrijft; alle
 * telefoons lezen mee via Supabase Realtime. Bevat geen deelnemerslijst —
 * alleen de prijs die nu getrokken wordt en het winnende lot.
 */
export interface TrekkingLive {
  ronde_id: string;
  fase: TrekkingFase;
  prijs_label: string | null;
  prijs_index: number; // 0-based
  prijs_totaal: number;
  hoofdprijs: boolean;
  winnaar_lotnummer: number | null;
  winnaar_naam: string | null;
  pool_nummers: number[]; // voor de rol-animatie op de telefoons
  bijgewerkt_op: string;
}

export interface Instellingen {
  id: number;
  penningmeester_naam: string | null;
  penningmeester_email: string | null;
  afzender: string | null; // afzenderadres voor de export-mail (Resend)
  mail_intro: string | null; // bewerkbare intro-tekst van de export-mail
  mail_afsluiting: string | null; // bewerkbare afsluiting/ondertekening
  clubnaam: string | null; // bijv. "Rotary Club Soest-Baarn"
  betaallinks: BetaalLinks | null; // per bundelbedrag de betaalverzoek-link
  updated_at: string;
}

export interface Doel {
  id: string;
  naam: string;
  omschrijving: string | null;
  opbrengst: number;
  jaar: number | null;
  maand: string | null; // eerste van de maand waarvoor dit doel geldt
  foto_url: string | null; // teaser-foto bij het goede doel
  sort: number;
  created_at: string;
}
