'use client';

import { useEffect } from 'react';
import { bewaarClubLid, zelfdeNaam } from '@/lib/clubLid';
import { leesMijnLoten, vergeetMijnLoten } from '@/lib/mijnLoten';

/**
 * Ingebed in de club-app: luistert naar het lid dat de club-app doorgeeft.
 * Alleen berichten van het eigen club-adres (PLATFORM_URL) tellen.
 */
export default function ClubKoppeling({ platformUrl }: { platformUrl: string | null }) {
  useEffect(() => {
    if (!platformUrl || window.self === window.top) return;
    const toegestaan = new URL(platformUrl).origin;
    const ontvang = (e: MessageEvent) => {
      if (e.origin !== toegestaan) return;
      const d = e.data as { type?: string; naam?: string; email?: string } | null;
      if (d?.type !== 'rotary-lid' || typeof d.naam !== 'string') return;
      // Loten van een ander lid op dit toestel (bv. eerder anders ingelogd) horen niet bij dit lid.
      const opToestel = leesMijnLoten();
      if (opToestel && !zelfdeNaam(opToestel.naam, d.naam)) vergeetMijnLoten();
      bewaarClubLid({ naam: d.naam.slice(0, 120), email: String(d.email ?? '').slice(0, 200) });
    };
    window.addEventListener('message', ontvang);
    // Laat de club-app weten dat we klaar zijn om te luisteren.
    window.parent.postMessage({ type: 'rotary-loterij-klaar' }, toegestaan);
    return () => window.removeEventListener('message', ontvang);
  }, [platformUrl]);
  return null;
}
