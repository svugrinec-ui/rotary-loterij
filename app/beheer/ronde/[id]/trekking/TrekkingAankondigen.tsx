'use client';

import { useState } from 'react';

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
      const data = (await res.json().catch(() => ({}))) as { aantal?: number; deelnemers?: number; fout?: string };
      if (!res.ok) throw new Error(data.fout ?? 'Versturen is niet gelukt.');
      setUitkomst(
        data.aantal
          ? `Verstuurd naar ${data.aantal} ${data.aantal === 1 ? 'telefoon' : 'telefoons'} van meespelers.`
          : 'Verstuurd, maar nog geen meespelers hebben meldingen aan.',
      );
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
