// De loterij werkt met bundels: voor een vast bedrag krijg je een aantal loten.
// Pas deze lijst gerust aan — de rest van de app volgt automatisch.
//
// Patroon: elke stap van €5 levert er een extra bonuslot bovenop
// (3, 7, 11, 15) → hoe meer je koopt, hoe voordeliger.
//
// De betaallinks per bundel staan niet hier maar in de instellingen (beheer →
// Instellingen), zodat elke club zijn eigen betaalverzoeken kan invullen.

export interface Bundel {
  bedrag: number; // in euro's
  loten: number; // aantal loten dat je hiervoor krijgt
}

export const BUNDELS: Bundel[] = [
  { bedrag: 5, loten: 3 },
  { bedrag: 10, loten: 7 },
  { bedrag: 15, loten: 11 },
  { bedrag: 20, loten: 15 },
];

/** Betaallink bij één bundel, zoals ingesteld in beheer. */
export interface BetaalLink {
  link: string; // betaalverzoek (bijv. Rabobank/ING/Tikkie): opent de bank-app / iDEAL
  zelfBedrag?: boolean; // link zonder vast bedrag: betaler vult zelf het bedrag in
}

/** Betaallinks per bundelbedrag, met het bedrag als sleutel ("5", "10", …). */
export type BetaalLinks = Record<string, BetaalLink>;

/** Zoekt de bundel bij een bedrag; null als het bedrag niet bestaat. */
export function bundelVoorBedrag(bedrag: number): Bundel | null {
  return BUNDELS.find((b) => b.bedrag === bedrag) ?? null;
}

/** De ingestelde betaallink voor een bedrag, of null als er geen is. */
export function betaalLinkVoor(links: BetaalLinks, bedrag: number): BetaalLink | null {
  const l = links[String(bedrag)];
  return l?.link ? l : null;
}

/** Naam van de bank achter een betaallink, voor de geruststellende regel onder de knop. */
export function betaalDienst(link: string): string | null {
  if (link.includes('rabobank.nl')) return 'Rabobank-betaalverzoek';
  if (link.includes('ing.nl')) return 'ING-betaalverzoek';
  if (link.includes('abnamro.nl')) return 'ABN AMRO-betaalverzoek';
  if (link.includes('tikkie.me')) return 'Tikkie';
  return null;
}
