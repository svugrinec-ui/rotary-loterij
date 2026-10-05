'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function uitkomstTekst(d: { aantal?: number; viaClub?: number; viaLoterij?: number }, leeg: string): string {
  if (!d.aantal) return leeg;
  const delen = [
    d.viaClub ? `${d.viaClub} ${d.viaClub === 1 ? 'lid' : 'leden'} via de club-app` : '',
    d.viaLoterij ? `${d.viaLoterij} ${d.viaLoterij === 1 ? 'telefoon' : 'telefoons'} via de loterij-app` : '',
  ].filter(Boolean);
  return `Verstuurd naar ${delen.join(' en ')}.`;
}


/** Nu een melding sturen aan wie zich heeft aangemeld maar nog geen lot heeft. */
export default function HerinneringKnop({
  rondeId,
  avondId,
  aantal,
  log,
  groot = false,
}: {
  rondeId: string;
  avondId: string;
  aantal?: number;
  log?: string | null;
  groot?: boolean;
}) {
  const router = useRouter();
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
      router.refresh();
    } catch (e) {
      setUitkomst(e instanceof Error ? e.message : 'Versturen is niet gelukt.');
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="trekking-aankondigen" style={{ margin: groot ? 0 : '8px 0 0' }}>
      <button className={`btn${groot ? '' : ' btn-sm'}`} type="button" onClick={stuur} disabled={bezig || aantal === 0}>
        {bezig ? 'Versturen…' : `🔔 Herinner wie nog geen lot heeft${aantal != null ? ` (${aantal})` : ''}`}
      </button>
      <p>
        {uitkomst ?? (log ? `Verstuurd: ${log}` : 'Om 18:00 op de avond gaat deze melding ook vanzelf.')}
      </p>
    </div>
  );
}
