'use client';

import { useEffect, useState } from 'react';
import { bewaarMijnLoten, leesMijnLoten, MIJN_LOTEN_EVENT } from '@/lib/mijnLoten';
import { CLUB_LID_EVENT, leesClubLid, type ClubLid } from '@/lib/clubLid';
import MijnLotenRij, { lotenTitel } from '@/components/MijnLotenRij';

/**
 * Lotnummers terugvinden. In de club-app weten we wie je bent: dan staan je
 * loten vanzelf in beeld (geen zoeken). Op de losse site zoek je op naam.
 */
export default function LotenOpzoeken() {
  const [lid, setLid] = useState<ClubLid | null>(null);
  useEffect(() => {
    const lees = () => setLid(leesClubLid());
    lees();
    window.addEventListener(CLUB_LID_EVENT, lees);
    return () => window.removeEventListener(CLUB_LID_EVENT, lees);
  }, []);
  return lid ? <JouwLoten lid={lid} /> : <ZoekOpNaam />;
}

/** Ingelogd via de club-app: je loten in de lopende ronde, zonder zoeken. */
function JouwLoten({ lid }: { lid: ClubLid }) {
  const [nummers, setNummers] = useState<number[]>([]);
  useEffect(() => {
    let actief = true;
    // Zelf opgeslagen? Dan niet opnieuw reageren op ons eigen 'gewijzigd'-signaal.
    let eigenOpslag = false;
    const haal = () =>
      fetch('/api/loten/opzoeken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naam: lid.naam, email: lid.email }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { ronde_id?: string; nummers?: number[] } | null) => {
          if (!actief || !data) return;
          const gevonden = data.nummers ?? [];
          // Staan ze al op dit toestel, dan toont het formulier erboven ze al: niet dubbel.
          const bekend = data.ronde_id ? leesMijnLoten(data.ronde_id)?.nummers ?? [] : [];
          const nieuw = gevonden.some((n) => !bekend.includes(n));
          setNummers(nieuw ? gevonden : []);
          // Onthouden op dit toestel: dan licht de live-trekking ze uit.
          if (data.ronde_id && nieuw) {
            eigenOpslag = true;
            bewaarMijnLoten(data.ronde_id, lid.naam, gevonden);
            eigenOpslag = false;
          }
        })
        .catch(() => {});
    haal();
    // Net loten gekocht? Dan opnieuw ophalen.
    const opnieuw = () => {
      if (!eigenOpslag) setTimeout(haal, 800);
    };
    window.addEventListener(MIJN_LOTEN_EVENT, opnieuw);
    return () => {
      actief = false;
      window.removeEventListener(MIJN_LOTEN_EVENT, opnieuw);
    };
  }, [lid.naam, lid.email]);

  if (nummers.length === 0) return null;
  return (
    <div className="lot-badge" style={{ marginTop: 14 }}>
      <MijnLotenRij nummers={nummers} titel={lotenTitel(nummers.length, lid.naam)} donker groot />
    </div>
  );
}

/** Losse site (niet ingelogd): zoeken op naam. */
function ZoekOpNaam() {
  const [naam, setNaam] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [nummers, setNummers] = useState<number[] | null>(null);

  async function zoek(e: React.FormEvent) {
    e.preventDefault();
    setFout(null);
    setNummers(null);
    if (!naam.trim()) {
      setFout('Vul je naam in.');
      return;
    }
    setBezig(true);
    try {
      const res = await fetch('/api/loten/opzoeken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naam: naam.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Zoeken mislukt.');
      const gevonden = (data.nummers as number[]) ?? [];
      // Meteen onthouden op dit toestel: dan staan ze klaar bij de live-trekking.
      if (data.ronde_id && gevonden.length > 0) {
        bewaarMijnLoten(data.ronde_id as string, naam.trim(), gevonden);
      }
      setNummers(gevonden);
    } catch (err) {
      setFout(err instanceof Error ? err.message : 'Onbekende fout.');
    } finally {
      setBezig(false);
    }
  }

  return (
    <details className="beheer-inklap">
      <summary>Je lotnummers kwijt? Zoek ze op</summary>
      <form onSubmit={zoek} style={{ marginTop: 12 }}>
        {fout && <div className="notice notice-err">{fout}</div>}
        <div className="inline-form">
          <div>
            <label htmlFor="zoek-naam">Je naam</label>
            <input
              id="zoek-naam"
              type="text"
              value={naam}
              onChange={(e) => setNaam(e.target.value)}
              placeholder="Voor- en achternaam"
              autoComplete="name"
            />
          </div>
          <button className="btn" type="submit" disabled={bezig}>
            {bezig ? 'Zoeken…' : 'Zoek'}
          </button>
        </div>
      </form>

      {nummers !== null &&
        (nummers.length > 0 ? (
          <div className="lot-badge" style={{ marginTop: 14 }}>
            <MijnLotenRij
              nummers={nummers}
              titel={lotenTitel(nummers.length, naam.trim())}
              donker
              groot
            />
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 12 }}>
            Geen loten gevonden op die naam voor de loterij van nu. Let even op de
            spelling, of vraag de commissie.
          </p>
        ))}
    </details>
  );
}
