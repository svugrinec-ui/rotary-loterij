'use client';

import { useState } from 'react';

function uitkomstTekst(d: { aantal?: number; viaClub?: number; viaLoterij?: number }, leeg: string): string {
  if (!d.aantal) return leeg;
  const delen = [
    d.viaClub ? `${d.viaClub} ${d.viaClub === 1 ? 'lid' : 'leden'} via de club-app` : '',
    d.viaLoterij ? `${d.viaLoterij} ${d.viaLoterij === 1 ? 'telefoon' : 'telefoons'} via de loterij-app` : '',
  ].filter(Boolean);
  return `Verstuurd naar ${delen.join(' en ')}.`;
}


/**
 * "De trekking begint zo": een melding naar iedereen die meespeelt (ook thuis),
 * zodat de telefoons al openstaan als de eerste prijs valt.
 */
export default function TrekkingAankondigen({ rondeId }: { rondeId: string }) {
  const [bezig, setBezig] = useState(false);
  const [uitkomst, setUitkomst] = useState<string | null>(null);

  async function stuur() {
    setBezig(true);
    setUitkomst(null);
    try {
      const res = await fetch('/api/admin/trekking-melding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ronde_id: rondeId }),
      });
      const data = (await res.json().catch(() => ({}))) as { aantal?: number; viaClub?: number; viaLoterij?: number; fout?: string };
      if (!res.ok) throw new Error(data.fout ?? 'Versturen is niet gelukt.');
      setUitkomst(uitkomstTekst(data, 'Verstuurd, maar nog geen meespelers hebben meldingen aan.'));
    } catch (e) {
      setUitkomst(e instanceof Error ? e.message : 'Versturen is niet gelukt.');
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="trekking-aankondigen">
      <button className="btn btn-gold" type="button" onClick={stuur} disabled={bezig}>
        {bezig ? 'Versturen…' : '📣 Melding: de trekking begint zo'}
      </button>
      <p>{uitkomst ?? 'Iedereen die meespeelt en meldingen aan heeft, pakt de app er alvast bij.'}</p>
    </div>
  );
}
