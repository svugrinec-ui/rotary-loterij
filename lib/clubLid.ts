// Wie de loterij opent vanuit de club-app, is daar ingelogd: de club-app geeft
// naam en e-mail door (postMessage), zodat je naam al klaarstaat en je loten
// zeker aan je aanmelding gekoppeld worden. Alleen voor deze sessie bewaard.

const KEY = 'rotary-loterij:club-lid';
export const CLUB_LID_EVENT = 'rotary-loterij:club-lid';

export interface ClubLid {
  naam: string;
  email: string;
}

// Ook in het geheugen: in een ingesloten venster mag de browser opslag soms weigeren.
let geheugen: ClubLid | null = null;

export function leesClubLid(): ClubLid | null {
  if (typeof window === 'undefined') return null;
  try {
    const data = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as ClubLid | null;
    return data?.naam ? data : geheugen;
  } catch {
    return geheugen;
  }
}

export function bewaarClubLid(lid: ClubLid): void {
  geheugen = lid;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(lid));
  } catch {
    /* privémodus: dan typt het lid zijn naam gewoon zelf */
  }
  window.dispatchEvent(new Event(CLUB_LID_EVENT));
}

/** Namen vergelijken zonder hoofdletters, accenten of extra spaties. */
export const zelfdeNaam = (a: string, b: string) => {
  const n = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  return n(a) === n(b);
};
