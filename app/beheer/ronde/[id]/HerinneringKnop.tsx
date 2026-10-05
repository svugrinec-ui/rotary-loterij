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


/** Nu een melding sturen aan wie zich heeft aangemeld maar nog geen lot heeft. */
export default function HerinneringKnop({ rondeId, avondId }: { rondeId: string; avondId: string }) {
  const [bezig, setBezig] = useState(false);
  const [uitkomst, setUitkomst] = useState<string | null>(null);

  async function stuur() {
    setBezig(true);
    setUitkomst(null);
    try {
      const res = await fetch('/api/admin/herinnering-loten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ronde_id: rondeId, avond_id: avondId }),
      });
      const data = (await res.json().catch(() => ({}))) as { aantal?: number; viaClub?: number; viaLoterij?: number; fout?: string };
      if (!res.ok) throw new Error(data.fout ?? 'Versturen is niet gelukt.');
      setUitkomst(uitkomstTekst(data, 'Niemand van hen heeft meldingen aan.'));
    } catch (e) {
      setUitkomst(e instanceof Error ? e.message : 'Versturen is niet gelukt.');
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="trekking-aankondigen" style={{ margin: '8px 0 0' }}>
      <button className="btn btn-sm" type="button" onClick={stuur} disabled={bezig}>
        {bezig ? 'Versturen…' : '🔔 Herinnering sturen'}
      </button>
      <p>{uitkomst ?? 'Om 18:00 op de avond gaat deze melding ook vanzelf.'}</p>
    </div>
  );
}
