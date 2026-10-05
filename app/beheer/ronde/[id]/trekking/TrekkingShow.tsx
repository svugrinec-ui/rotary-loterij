'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { maakWinnaar } from '@/lib/actions';
import { IconTrophy } from '@/components/Icons';
import FotoKiezer from '@/components/FotoKiezer';
import CijferNummer from '@/components/CijferNummer';
import { CIJFER_MS } from '@/lib/cijferReveal';
import TrekkingAankondigen from './TrekkingAankondigen';

interface Lot {
  lotnummer: number;
  naam: string;
}

interface Experience {
  titel: string;
  aanbieder: string | null;
}

interface Props {
  rondeId: string;
  rondeNaam: string;
  datum: string;
  experiences: Experience[];
  betaaldeLoten: Lot[];
}

interface Gewonnen {
  prijs: string;
  hoofdprijs: boolean;
  lot: Lot;
}

/** Namen vergelijken zonder gedoe met hoofdletters of spaties. */
function sleutel(naam: string): string {
  return naam.trim().toLowerCase();
}

export default function TrekkingShow({
  rondeId,
  rondeNaam,
  datum,
  experiences,
  betaaldeLoten,
}: Props) {
  const deelnemers = new Set(betaaldeLoten.map((l) => sleutel(l.naam))).size;
  // Er wordt per lot getrokken — meer loten is dus meer kans — maar wie een
  // prijs wint, gaat er met al zijn loten uit. Niemand wint twee keer in
  // dezelfde trekking, en daarmee zijn er nooit meer prijzen dan deelnemers.
  const maxPrijzen = Math.max(1, Math.min(deelnemers, 10));

  const [aantal, setAantal] = useState(Math.min(5, maxPrijzen));
  // De hoofdprijs (experience + aanbieder) komt uit de ronde — niet bewerkbaar hier.
  const hoofdprijs = experiences[0]?.titel ?? 'Hoofdprijs';
  const aanbieder = experiences[0]?.aanbieder ?? '';
  const [fase, setFase] = useState<'setup' | 'show' | 'klaar'>('setup');

  // --- tijdens de show ---
  const [prijzen, setPrijzen] = useState<{ label: string; hoofdprijs: boolean }[]>([]);
  const [index, setIndex] = useState(0);
  const [pool, setPool] = useState<Lot[]>([]);
  const [winnaars, setWinnaars] = useState<Gewonnen[]>([]);
  const [display, setDisplay] = useState<number | null>(null);
  const [cycling, setCycling] = useState(false);
  const [onthuld, setOnthuld] = useState<Lot | null>(null);
  const [opgeslagen, setOpgeslagen] = useState(false);
  // Hoeveel cijfers van het winnende lot al in beeld staan.
  const [zichtbaar, setZichtbaar] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cijferTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  function stopCijfers() {
    cijferTimers.current.forEach(clearTimeout);
    cijferTimers.current = [];
    setZichtbaar(0);
  }

  const poolNums = betaaldeLoten.map((l) => l.lotnummer);

  /**
   * Zendt de stand uit naar de telefoons in de zaal (pagina /live). Bewust
   * fire-and-forget: de show op dit toestel mag er nooit op wachten.
   */
  function zendUit(stand: {
    fase: 'wachten' | 'rollen' | 'onthuld' | 'klaar';
    prijs?: { label: string; hoofdprijs: boolean };
    prijsIndex?: number;
    prijsTotaal?: number;
    winnaar?: Lot | null;
    pool?: number[];
  }) {
    fetch('/api/admin/trekking-live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ronde_id: rondeId,
        fase: stand.fase,
        prijs_label: stand.prijs?.label ?? null,
        hoofdprijs: stand.prijs?.hoofdprijs ?? false,
        prijs_index: stand.prijsIndex ?? 0,
        prijs_totaal: stand.prijsTotaal ?? 0,
        winnaar_lotnummer: stand.winnaar?.lotnummer ?? null,
        winnaar_naam: stand.winnaar?.naam ?? null,
        ...(stand.pool ? { pool_nummers: stand.pool } : {}),
      }),
    }).catch(() => {});
  }

  function start() {
    // Onthullingsvolgorde: kleinste prijs eerst, hoofdprijs (experience) als climax.
    const lijst: { label: string; hoofdprijs: boolean }[] = [];
    for (let p = aantal; p >= 2; p--) lijst.push({ label: `${p}e prijs`, hoofdprijs: false });
    lijst.push({ label: hoofdprijs, hoofdprijs: true });
    setPrijzen(lijst);
    setPool([...betaaldeLoten]);
    setWinnaars([]);
    setIndex(0);
    setOnthuld(null);
    setDisplay(null);
    setFase('show');
    zendUit({
      fase: 'wachten',
      prijs: lijst[0],
      prijsIndex: 0,
      prijsTotaal: lijst.length,
      pool: poolNums,
    });
  }

  /**
   * Onthult het lotnummer cijfer voor cijfer op het zaalscherm, met dezelfde
   * tussentijd als de telefoons. De naam volgt pas na het laatste cijfer.
   */
  function onthulCijfers(nummer: number) {
    const lengte = String(nummer).length;
    setZichtbaar(0);
    for (let i = 1; i <= lengte; i++) {
      cijferTimers.current.push(setTimeout(() => setZichtbaar(i), i * CIJFER_MS));
    }
  }

  function trek() {
    if (cycling || onthuld || pool.length === 0) return;
    const winnaar = pool[Math.floor(Math.random() * pool.length)];
    setCycling(true);
    // De zaal begint gelijk met rollen; de onthulling volgt hieronder.
    zendUit({
      fase: 'rollen',
      prijs: prijzen[index],
      prijsIndex: index,
      prijsTotaal: prijzen.length,
    });

    // Laat alleen nummers voorbijkomen die nog meedoen.
    const rolNums = pool.length > 0 ? pool.map((l) => l.lotnummer) : poolNums;

    let verstreken = 0;
    let delay = 45;
    const totaal = 2600;
    const tick = () => {
      setDisplay(rolNums[Math.floor(Math.random() * rolNums.length)]);
      verstreken += delay;
      if (verstreken >= totaal) {
        setDisplay(winnaar.lotnummer);
        setCycling(false);
        setOnthuld(winnaar);
        // Cijfer voor cijfer, gelijk met de telefoons in de zaal.
        onthulCijfers(winnaar.lotnummer);
        // De winnaar gaat er met al zijn loten uit: niemand wint twee keer.
        setPool((prev) => prev.filter((l) => sleutel(l.naam) !== sleutel(winnaar.naam)));
        setWinnaars((prev) => [
          ...prev,
          { prijs: prijzen[index].label, hoofdprijs: prijzen[index].hoofdprijs, lot: winnaar },
        ]);
        zendUit({
          fase: 'onthuld',
          prijs: prijzen[index],
          prijsIndex: index,
          prijsTotaal: prijzen.length,
          winnaar,
        });
        return;
      }
      if (verstreken > totaal * 0.65) delay += 16; // afremmen naar het einde
      timer.current = setTimeout(tick, delay);
    };
    tick();
  }

  function volgende() {
    stopCijfers();
    setOnthuld(null);
    setDisplay(null);
    if (index + 1 >= prijzen.length) {
      setFase('klaar');
      // De hoofdprijs-winnaar blijft in de uitzending staan: daarmee vult het
      // beheerformulier zich in als de galerij nog niet gevuld is. De zaal ziet
      // hier niets meer van — bij fase 'klaar' is de trekking voorbij.
      const hoofd = winnaars.find((w) => w.hoofdprijs);
      zendUit({
        fase: 'klaar',
        prijsIndex: index,
        prijsTotaal: prijzen.length,
        winnaar: hoofd?.lot ?? null,
      });
    } else {
      setIndex((i) => i + 1);
      zendUit({
        fase: 'wachten',
        prijs: prijzen[index + 1],
        prijsIndex: index + 1,
        prijsTotaal: prijzen.length,
      });
    }
  }

  // Winnaar accepteert niet: haal 'm uit de uitslag en trek opnieuw voor
  // DEZELFDE prijs. Wie geweigerd heeft is al uit de pool en komt niet terug.
  function herkans() {
    stopCijfers();
    setWinnaars((prev) => prev.slice(0, -1));
    setOnthuld(null);
    setDisplay(null);
    zendUit({
      fase: 'wachten',
      prijs: prijzen[index],
      prijsIndex: index,
      prijsTotaal: prijzen.length,
    });
  }

  function opnieuw() {
    if (timer.current) clearTimeout(timer.current);
    stopCijfers();
    zendUit({ fase: 'klaar', prijsIndex: 0, prijsTotaal: 0 });
    setFase('setup');
    setWinnaars([]);
    setOnthuld(null);
    setDisplay(null);
    setCycling(false);
    setOpgeslagen(false);
  }

  // ---------- Setup ----------
  if (fase === 'setup') {
    return (
      <>
        <p style={{ marginTop: 20 }}>
          <Link href={`/beheer/ronde/${rondeId}`}>← Terug naar ronde</Link>
        </p>
        <h1>Trekking — {rondeNaam}</h1>

        <TrekkingAankondigen rondeId={rondeId} />

        {experiences.length === 0 ? (
          <div className="notice notice-err">
            Deze ronde heeft nog geen hoofdprijs (experience + aanbieder). Voeg die
            eerst toe bij de{' '}
            <Link href={`/beheer/ronde/${rondeId}`}>ronde</Link>.
          </div>
        ) : betaaldeLoten.length === 0 ? (
          <div className="notice notice-err">
            Er zijn nog geen betaalde loten om uit te trekken. Vink eerst betalingen af.
          </div>
        ) : (
          <div className="panel">
            <p className="muted" style={{ marginTop: 0 }}>
              {betaaldeLoten.length} betaalde loten van {deelnemers} deelnemers.
              De hoofdprijs wordt als laatste getrokken. Wie een prijs wint, doet
              met al zijn loten niet meer mee voor de volgende — niemand wint dus
              twee keer op dezelfde avond.
            </p>

            <label>Aantal prijzen</label>
            <div className="row-actions" style={{ marginBottom: 6 }}>
              {[3, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`btn ${aantal === n ? '' : 'btn-ghost'}`}
                  onClick={() => setAantal(Math.min(n, maxPrijzen))}
                  disabled={n > maxPrijzen}
                >
                  {n} prijzen
                </button>
              ))}
              <input
                type="number"
                min={1}
                max={maxPrijzen}
                value={aantal}
                onChange={(e) =>
                  setAantal(Math.max(1, Math.min(maxPrijzen, Number(e.target.value) || 1)))
                }
                style={{ maxWidth: 90 }}
              />
            </div>
            {maxPrijzen < aantal && (
              <p className="muted">Er zijn maar {maxPrijzen} deelnemers.</p>
            )}

            <label>Hoofdprijs</label>
            <div className="trekking-hoofdprijs">
              <strong>{hoofdprijs}</strong>
              {aanbieder && (
                <span className="muted"> · aangeboden door {aanbieder}</span>
              )}
            </div>

            <div className="notice notice-info" style={{ marginTop: 16 }}>
              Wat jij hier trekt, verschijnt gelijk op alle telefoons in de zaal —
              met ieders eigen lotnummers erbij. Zolang de trekking loopt kan er
              niemand meer loten kopen.
            </div>

            <div style={{ marginTop: 18 }}>
              <button className="btn btn-gold btn-groot" onClick={start}>
                <IconTrophy size={20} /> Start trekking
              </button>
            </div>

            <button
              className="trekking-herkans"
              style={{ display: 'block' }}
              onClick={() => zendUit({ fase: 'klaar', prijsIndex: 0, prijsTotaal: 0 })}
            >
              Blijft er een trekking op de telefoons staan? Zaalscherm sluiten
            </button>
          </div>
        )}
      </>
    );
  }

  // ---------- Klaar: overzicht ----------
  if (fase === 'klaar') {
    const hoofd = winnaars.find((w) => w.hoofdprijs);
    return (
      <>
        <p style={{ marginTop: 20 }}>
          <Link href={`/beheer/ronde/${rondeId}`}>← Terug naar ronde</Link>
        </p>
        <h1>Uitslag — {rondeNaam}</h1>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Prijs</th>
                <th>Lot</th>
                <th>Winnaar</th>
              </tr>
            </thead>
            <tbody>
              {winnaars.map((w, i) => (
                <tr key={i}>
                  <td>
                    {w.hoofdprijs ? (
                      <strong>
                        <IconTrophy size={15} /> {w.prijs}
                      </strong>
                    ) : (
                      w.prijs
                    )}
                  </td>
                  <td>#{w.lot.lotnummer}</td>
                  <td>{w.lot.naam}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {hoofd && !opgeslagen && (
          <form
            className="panel"
            action={async (fd) => {
              await maakWinnaar(fd);
              setOpgeslagen(true);
            }}
          >
            <h3 style={{ marginTop: 0 }}>Hoofdprijs-winnaar in de galerij zetten</h3>
            <input type="hidden" name="ronde_id" value={rondeId} />
            <input type="hidden" name="maand" value={datum} />
            <input type="hidden" name="naam" value={hoofd.lot.naam} />
            <input type="hidden" name="experience_titel" value={hoofdprijs} />
            <input type="hidden" name="aanbieder" value={aanbieder} />
            <p className="muted" style={{ marginTop: 0 }}>
              {hoofd.lot.naam} — {hoofdprijs}
              {aanbieder ? ` (aangeboden door ${aanbieder})` : ''}. Voeg eventueel
              foto&apos;s toe.
            </p>
            <label>Foto&apos;s (optioneel) — meerdere tegelijk mag</label>
            <FotoKiezer multiple />
            <div style={{ marginTop: 14 }}>
              <button className="btn" type="submit">
                Publiceren in galerij
              </button>
            </div>
          </form>
        )}
        {opgeslagen && (
          <div className="notice notice-ok">Hoofdprijs-winnaar staat in de galerij.</div>
        )}

        <div className="row-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={opnieuw}>
            Opnieuw trekken
          </button>
        </div>
      </>
    );
  }

  // ---------- Show: fullscreen onthulling ----------
  const huidige = prijzen[index];
  // Alle cijfers in beeld? Dan mag de naam erbij.
  const cijfersKlaar =
    !!onthuld && zichtbaar >= String(onthuld.lotnummer).length;
  return (
    <div className="trekking-overlay">
      <div className="trekking-ronde">{rondeNaam}</div>

      <div className="trekking-label">
        Prijs {index + 1} van {prijzen.length}
      </div>
      <div className={`trekking-prijs ${huidige?.hoofdprijs ? 'hoofd' : ''}`}>
        {huidige?.hoofdprijs ? (
          <>
            <IconTrophy size={26} /> {huidige.label}
          </>
        ) : (
          huidige?.label
        )}
      </div>

      <div
        className={`trekking-nummer cijferrij ${cycling ? 'cycling' : ''} ${
          cijfersKlaar ? 'reveal' : ''
        }`}
      >
        {onthuld ? (
          <CijferNummer nummer={onthuld.lotnummer} zichtbaar={zichtbaar} />
        ) : display === null ? (
          ' '
        ) : (
          `#${display}`
        )}
      </div>

      {cijfersKlaar && onthuld ? (
        <div className="trekking-naam reveal">
          <IconTrophy size={40} /> {onthuld.naam}
        </div>
      ) : (
        <div className="trekking-naam placeholder">&nbsp;</div>
      )}

      <div className="trekking-actions">
        {!onthuld && pool.length === 0 ? (
          // Kan gebeuren als winnaars achter elkaar weigeren: iedereen is op.
          <div className="trekking-label">
            Alle deelnemers hebben al een prijs. Ga naar de uitslag.
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-groot" onClick={() => setFase('klaar')}>
                Naar de uitslag →
              </button>
            </div>
          </div>
        ) : !onthuld ? (
          <button className="btn btn-gold btn-groot" onClick={trek} disabled={cycling}>
            {cycling ? 'Trekken…' : 'Trek de winnaar'}
          </button>
        ) : (
          <button className="btn btn-groot" onClick={volgende}>
            {index + 1 >= prijzen.length ? 'Naar de uitslag →' : 'Volgende prijs →'}
          </button>
        )}
      </div>

      {onthuld && pool.length > 0 && (
        <button className="trekking-herkans" onClick={herkans}>
          Winnaar accepteert niet? Trek opnieuw voor deze prijs
        </button>
      )}

      <button className="trekking-sluit" onClick={opnieuw} aria-label="Sluiten">
        ✕
      </button>
    </div>
  );
}
