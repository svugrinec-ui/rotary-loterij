'use client';

import { useState } from 'react';

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
      const data = (await res.json().catch(() => ({}))) as { aantal?: number; fout?: string };
      if (!res.ok) throw new Error(data.fout ?? 'Versturen is niet gelukt.');
      setUitkomst(
        data.aantal
          ? `Verstuurd naar ${data.aantal} ${data.aantal === 1 ? 'telefoon' : 'telefoons'}.`
          : 'Niemand van hen heeft meldingen aan in de loterij-app.',
      );
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
