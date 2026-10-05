'use client';

import { useState, useEffect, useRef } from 'react';
import { CLUB_LID_EVENT, leesClubLid, zelfdeNaam } from '@/lib/clubLid';
import { euro } from '@/lib/format';
import {
  BUNDELS,
  bundelVoorBedrag,
  betaalLinkVoor,
  betaalDienst,
  type BetaalLinks,
} from '@/lib/bundels';
import {
  bewaarBetaalStap,
  bewaarMijnLoten,
  leesMijnLoten,
  vergeetMijnLoten,
} from '@/lib/mijnLoten';
import MijnLotenRij, { lotenTitel } from '@/components/MijnLotenRij';
import Stappen from '@/components/Stappen';
import { IconLock } from '@/components/Icons';

interface Props {
  rondeId: string;
  betaalLinks: BetaalLinks; // uit de instellingen (beheer)
}

interface Toegekend {
  nummers: number[];
  naam: string;
  bedrag: number;
}

export default function MeedoenForm({ rondeId, betaalLinks }: Props) {
  const [naam, setNaam] = useState('');
  const [bedrag, setBedrag] = useState<number>(BUNDELS[0]?.bedrag ?? 5);
  const [betaalwijze, setBetaalwijze] = useState<'bank' | 'cash'>('bank');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [resultaat, setResultaat] = useState<Toegekend | null>(null);
  // Zachte duplicaat-check: al bestaande loten op deze naam in deze ronde.
  const [bekend, setBekend] = useState<number[] | null>(null);
  const [getoond, setGetoond] = useState(false);
  // Eigen lotnummers kiezen.
  const [eigenModus, setEigenModus] = useState(false);
  const [eigenNummers, setEigenNummers] = useState<string[]>([]);
  const [pending, setPending] = useState<number[] | null>(null); // keuze onthouden voor "toch bijkopen"
  const [bezet, setBezet] = useState<Set<number>>(new Set()); // al vergeven nummers in de ronde
  // Kwam dit scherm terug uit de browseropslag (herladen, terug van de bank,
  // na de trekking)? Dan is het lotenmoment al geweest en staat de betaalstap
  // vooraan in de stappenbalk.
  const [hersteld, setHersteld] = useState(false);
  // In de club-app: alles al betaald (volgens de penningmeester)? Dan geen betaalstap.
  const [alBetaald, setAlBetaald] = useState(false);
  const [inApp, setInApp] = useState(false);
  // Is de betaalstap gezet (contant gekozen of op de bankknop getikt)? Dan
  // licht stap 3 op in de stappenbalk.
  const [betaalStap, setBetaalStap] = useState(false);
  // Is de bezoeker terug uit de bank-app/het betaaltabblad?
  const [terugVanBank, setTerugVanBank] = useState(false);
  // Na "Betaal via je bank" of "Contant" klapt stap 3 in; met de link eronder weer open.
  const [uitgeklapt, setUitgeklapt] = useState(false);
  const wasWeg = useRef(false);
  // Staat het betaalblok in beeld? Dan is stap 3 waar de bezoeker is, ook
  // zonder dat hij al iets heeft aangetikt.
  const [betaalInBeeld, setBetaalInBeeld] = useState(false);
  const betaalBlok = useRef<HTMLDivElement | null>(null);

  // Vanuit de club-app: je naam staat al klaar (zolang je nog niets typte), en
  // je loten komen uit de loterij zelf — niet uit het geheugen van dit toestel.
  // Zo zie je na een herstart of op een ander toestel gewoon dat je meedoet.
  useEffect(() => {
    let gehaald = false;
    const vul = () => {
      const lid = leesClubLid();
      if (!lid) return;
      setInApp(true);
      setNaam((huidig) => huidig || lid.naam);
      if (gehaald) return;
      gehaald = true;
      fetch('/api/loten/opzoeken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naam: lid.naam, email: lid.email }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { ronde_id?: string; nummers?: number[]; totaal?: number; openstaand?: number } | null) => {
          if (!d || (d.ronde_id && d.ronde_id !== rondeId)) return;
          if (!d.nummers?.length) {
            // Geen loten op jouw naam. Staan er op dit toestel nog loten van iemand anders
            // (bv. eerder ingelogd als een ander lid)? Die horen niet bij jou: weg ermee.
            const opToestel = leesMijnLoten(rondeId);
            if (opToestel && !zelfdeNaam(opToestel.naam, lid.naam)) {
              vergeetMijnLoten();
              opnieuw(true);
            }
            return;
          }
          const open = d.openstaand ?? 0;
          setResultaat({ nummers: d.nummers, naam: lid.naam, bedrag: open > 0 ? open : d.totaal ?? 0 });
          setHersteld(true);
          setAlBetaald(open === 0);
          bewaarMijnLoten(rondeId, lid.naam, d.nummers, open > 0 ? open : d.totaal);
        })
        .catch(() => {});
    };
    vul();
    window.addEventListener(CLUB_LID_EVENT, vul);
    return () => window.removeEventListener(CLUB_LID_EVENT, vul);
  }, []);

  const huidigeBundel = bundelVoorBedrag(bedrag);
  const aantalNummers = huidigeBundel?.loten ?? 0;
  // Staat er minstens één ingevuld nummer dat al vergeven is?
  const heeftBezetNummer = Array.from({ length: aantalNummers }, (_, i) =>
    (eigenNummers[i] ?? '').trim(),
  ).some((v) => v !== '' && bezet.has(Number(v)));

  /**
   * Stap 2 ("je loten") is een kort moment, geen rustpunt: zodra het betaalblok
   * in beeld staat, is stap 3 waar de bezoeker zit. Wel eerst een paar seconden
   * wachten, zodat het zien van je eigen nummers zijn moment houdt. Wie niet
   * scrollt, schuift na 12 seconden alsnog door — dan is het lezen wel klaar.
   */
  useEffect(() => {
    if (!resultaat || betaalStap || hersteld) return;
    const blok = betaalBlok.current;
    let vrij = false;
    const openen = () => setBetaalInBeeld(true);

    const beat = setTimeout(() => {
      vrij = true;
    }, 4000);
    const achtervang = setTimeout(openen, 12000);

    const kijker = blok
      ? new IntersectionObserver(
          (rijen) => {
            if (rijen.some((r) => r.isIntersecting) && vrij) openen();
          },
          { threshold: 0.4 },
        )
      : null;
    if (blok && kijker) kijker.observe(blok);

    return () => {
      clearTimeout(beat);
      clearTimeout(achtervang);
      kijker?.disconnect();
    };
  }, [resultaat, betaalStap, hersteld]);

  // Terug uit de bank-app of het betaaltabblad? Dan hoort dit scherm niet meer
  // om betaling te vragen. We weten niet óf het gelukt is (dat vinkt de
  // penningmeester af), dus we vragen het vriendelijk in plaats van te beweren.
  useEffect(() => {
    if (!betaalStap || betaalwijze !== 'bank') return;
    const kijk = () => {
      if (document.hidden) wasWeg.current = true;
      else if (wasWeg.current) setTerugVanBank(true);
    };
    document.addEventListener('visibilitychange', kijk);
    return () => document.removeEventListener('visibilitychange', kijk);
  }, [betaalStap, betaalwijze]);

  /**
   * Bij het openen: had deze bezoeker al loten gekocht op dit toestel? Dan
   * komt hij terug op zijn eigen loten en de betaalstap — niet op stap 1, want
   * dan is de eerste gedachte "heb ik nou wel of geen loten gekocht?".
   * Gebeurt bij terugkomst uit de bank-app, bij een herstart van de PWA en na
   * de trekking.
   */
  useEffect(() => {
    const opgeslagen = leesMijnLoten(rondeId);
    if (!opgeslagen || opgeslagen.nummers.length === 0 || !opgeslagen.bedrag) return;
    setResultaat({
      nummers: opgeslagen.nummers,
      naam: opgeslagen.naam,
      bedrag: opgeslagen.bedrag,
    });
    setHersteld(true);
    if (opgeslagen.betaalwijze) setBetaalwijze(opgeslagen.betaalwijze);
    if (opgeslagen.betaalGestart) {
      setBetaalStap(true);
      // Hij was al bij de bank; vraag of het gelukt is in plaats van opnieuw
      // om betaling te vragen.
      if (opgeslagen.betaalwijze === 'bank') setTerugVanBank(true);
    }
  }, [rondeId]);

  // Bij het openen van "eigen nummers" de al vergeven nummers ophalen.
  useEffect(() => {
    if (!eigenModus) return;
    let actief = true;
    fetch(`/api/loten/bezet?ronde_id=${encodeURIComponent(rondeId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (actief && Array.isArray(d.nummers)) setBezet(new Set(d.nummers as number[]));
      })
      .catch(() => {});
    return () => {
      actief = false;
    };
  }, [eigenModus, rondeId]);

  // De echte inschrijving (loten aanmaken). nummers = null → willekeurig.
  async function maakLoten(nummers: number[] | null) {
    const res = await fetch('/api/loten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ronde_id: rondeId,
        naam: naam.trim(),
        // Loten op je eigen naam vanuit de club-app: met je e-mail erbij, zodat ze zeker bij je aanmelding horen.
        contact: (() => {
          const lid = leesClubLid();
          return lid?.email && zelfdeNaam(lid.naam, naam) ? lid.email : null;
        })(),
        bedrag,
        ...(nummers ? { nummers } : {}),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Er ging iets mis.');
    // Onthouden op dit toestel, zodat de live-trekking je eigen nummers
    // groot in beeld kan zetten.
    bewaarMijnLoten(rondeId, naam.trim(), data.nummers as number[], data.bedrag);
    setBekend(null);
    setBetaalwijze('bank'); // standaard bank; keuze valt nu op het betaalscherm
    setResultaat({ nummers: data.nummers, naam: naam.trim(), bedrag: data.bedrag });
  }

  // Valideert de zelf ingevulde nummers; geeft ze terug of null (met foutmelding).
  function leesEigenNummers(): number[] | null {
    const vals = Array.from({ length: aantalNummers }, (_, i) => (eigenNummers[i] ?? '').trim());
    if (vals.some((v) => v === '')) {
      setFout(`Vul alle ${aantalNummers} lotnummers in.`);
      return null;
    }
    const nums = vals.map((v) => Number(v));
    if (nums.some((n) => !Number.isInteger(n) || n < 1000 || n > 9999)) {
      setFout('Lotnummers zijn vier cijfers: 1000 t/m 9999.');
      return null;
    }
    if (new Set(nums).size !== nums.length) {
      setFout('Je hebt een dubbel lotnummer gekozen.');
      return null;
    }
    return nums;
  }

  // Gedeelde inschrijf-poging: naam-check → duplicaat-check → aanmaken.
  async function probeer(nummers: number[] | null) {
    setFout(null);
    if (!naam.trim()) {
      setFout('Vul je naam in.');
      return;
    }
    setBezig(true);
    try {
      const check = await fetch('/api/loten/opzoeken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naam: naam.trim() }),
      });
      const cd = await check.json().catch(() => ({}));
      if (check.ok && Array.isArray(cd.nummers) && cd.nummers.length > 0) {
        setPending(nummers); // onthoud de keuze voor "toch bijkopen"
        bewaarMijnLoten(rondeId, naam.trim(), cd.nummers as number[]);
        setBekend(cd.nummers as number[]);
        return; // waarschuwing tonen; nog niks aanmaken
      }
      await maakLoten(nummers);
    } catch (err) {
      setFout(err instanceof Error ? err.message : 'Onbekende fout.');
    } finally {
      setBezig(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    probeer(null); // willekeurige nummers
  }

  function bevestigEigen() {
    const nums = leesEigenNummers();
    if (nums) probeer(nums);
  }

  // "Toch een extra bundel bijkopen" — na de waarschuwing alsnog aanmaken.
  async function tochBijkopen() {
    setFout(null);
    setBezig(true);
    try {
      await maakLoten(pending);
    } catch (err) {
      setFout(err instanceof Error ? err.message : 'Onbekende fout.');
    } finally {
      setBezig(false);
    }
  }

  // Betaalwijze kiezen op het betaalscherm (stap 3) → meteen wegschrijven.
  function kiesBetaalwijze(wijze: 'bank' | 'cash') {
    setBetaalwijze(wijze);
    // Contant kiezen ís de betaalstap zetten: dan licht stap 3 op.
    if (wijze === 'cash') {
      setBetaalStap(true);
      setUitgeklapt(false);
      bewaarBetaalStap(rondeId, 'cash');
    }
    if (!resultaat) return;
    fetch('/api/loten/betaalwijze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ronde_id: rondeId,
        naam: resultaat.naam,
        nummers: resultaat.nummers,
        betaalwijze: wijze,
      }),
    }).catch(() => {});
  }

  /**
   * Van dit toestel wissen. Nodig op een gedeelde telefoon, na een test, of
   * als iemand anders zich hier heeft ingeschreven: anders blijft dat scherm
   * terugkomen. De loten zelf blijven gewoon meedoen met de trekking — dit
   * wist alleen wat deze browser onthoudt.
   */
  function wisVanToestel() {
    vergeetMijnLoten();
    opnieuw();
  }

  /** Terug naar stap 1. Met eigenNaam (club-app, "Meer loten kopen") staat je eigen naam al klaar. */
  function opnieuw(eigenNaam = false) {
    setAlBetaald(false);
    setUitgeklapt(false);
    setBetaalStap(false);
    setBetaalInBeeld(false);
    setTerugVanBank(false);
    setHersteld(false);
    setResultaat(null);
    setBekend(null);
    setGetoond(false);
    setNaam(eigenNaam ? leesClubLid()?.naam ?? '' : '');
    setBedrag(BUNDELS[0]?.bedrag ?? 5);
    setBetaalwijze('bank');
    setEigenModus(false);
    setEigenNummers([]);
    setPending(null);
  }

  // ---------- Resultaat: eerst de loten, dan betalen ----------
  if (resultaat) {
    const betaal = betaalLinkVoor(betaalLinks, resultaat.bedrag);
    const dienst = betaal ? betaalDienst(betaal.link) : null;
    return (
      <>
        {/* Verse aankoop → kort stap 2 (kijk, je loten). Zodra het betalen in
            beeld komt, je iets aantikt of je terugkomt → stap 3, zodat niemand
            denkt dat hij opnieuw moet beginnen. */}
        <Stappen actief={betaalStap || hersteld || betaalInBeeld ? 3 : 2} />

        <div className="lot-badge">
          <small>Gelukt — je doet mee!</small>
          <MijnLotenRij
            nummers={resultaat.nummers}
            titel={lotenTitel(resultaat.nummers.length, resultaat.naam)}
            donker
            groot
          />
          <small>
            <strong>Je loten staan vast</strong> — je doet mee met de trekking, óók als je
            dit scherm wegklikt. Bij het trekken roepen we de naam om.
          </small>
        </div>

        <p className="muted alleen-los" style={{ textAlign: 'center', marginTop: 12, marginBottom: 0 }}>
          {hersteld
            ? 'Je loten staan klaar. Bij de trekking hoef je niets te doen: die verschijnt vanzelf op dit scherm, met jouw nummers erbij.'
            : 'Bij de trekking hoef je niets te doen: die verschijnt vanzelf op dit scherm, met jouw nummers erbij.'}
        </p>

        {alBetaald ? (
          <div className="notice notice-ok" style={{ marginTop: 20, textAlign: 'center' }}>
            <strong>✓ Betaald</strong> — je doet mee. Nu is het wachten op de trekking.
          </div>
        ) : betaalStap && !uitgeklapt ? (
          // Betaalstap gezet: kort samengevat, met een weg terug als het niet lukte.
          <div className="panel betaal-ingeklapt" ref={betaalBlok}>
            <div className="betaal-eyebrow">Stap 3 · Betalen</div>
            <p>
              <strong>
                {euro(resultaat.bedrag)} {betaalwijze === 'cash' ? 'contant aan de commissie' : 'via je bank'} ✓
              </strong>
              <br />
              <span className="muted">De penningmeester vinkt je betaling af.</span>
            </p>
            {betaalwijze === 'cash' ? (
              <button type="button" className="knop-link" onClick={() => { setUitgeklapt(true); kiesBetaalwijze('bank'); }}>
                Toch via de bank betalen?
              </button>
            ) : (
              <button type="button" className="knop-link" onClick={() => { setUitgeklapt(true); setTerugVanBank(false); }}>
                Betaling niet gelukt? Opnieuw betalen
              </button>
            )}
          </div>
        ) : (
        <div
          className="panel"
          style={{ textAlign: 'center', marginTop: 28 }}
          ref={betaalBlok}
        >
          <div className="betaal-eyebrow">Stap 3 · Betalen</div>
          <h3 style={{ marginTop: 4 }}>Betalen: {euro(resultaat.bedrag)}</h3>

          <div className="betaalwijze-grid" style={{ marginTop: 12, textAlign: 'left' }}>
            <button
              type="button"
              className={`betaalwijze-kaart ${betaalwijze === 'bank' ? 'gekozen' : ''}`}
              onClick={() => kiesBetaalwijze('bank')}
              aria-pressed={betaalwijze === 'bank'}
            >
              <span className="betaalwijze-titel">Via bank</span>
              <span className="betaalwijze-sub">iDEAL / betaalverzoek</span>
            </button>
            <button
              type="button"
              className={`betaalwijze-kaart ${betaalwijze === 'cash' ? 'gekozen' : ''}`}
              onClick={() => kiesBetaalwijze('cash')}
              aria-pressed={betaalwijze === 'cash'}
            >
              <span className="betaalwijze-titel">Contant</span>
              <span className="betaalwijze-sub">cash aan de commissie</span>
            </button>
          </div>

          {betaalwijze === 'cash' ? (
            <div className="notice notice-info" style={{ marginTop: 14 }}>
              Geef <strong>{euro(resultaat.bedrag)}</strong> contant aan de
              loterijcommissie. Je loten doen al mee — de commissie vinkt je
              betaling straks af.
            </div>
          ) : terugVanBank ? (
            // Terug uit de bank: niet nóg eens om geld vragen. We weten niet of
            // het gelukt is, dus vragen we het in plaats van het te beweren.
            <div className="notice notice-ok" style={{ marginTop: 14, textAlign: 'left' }}>
              <strong>Dat was het — je doet mee.</strong> Is je betaling van{' '}
              {euro(resultaat.bedrag)} gelukt, dan hoef je niets meer te doen; de
              penningmeester vinkt hem af. Nu is het wachten op de trekking, die
              vanzelf op dit scherm verschijnt.
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setTerugVanBank(false)}
                >
                  Betaling niet gelukt? Opnieuw betalen
                </button>
              </div>
            </div>
          ) : (
            <>
              {betaal?.zelfBedrag && (
                <div className="notice notice-info" style={{ marginTop: 14 }}>
                  Bij deze betaling vul je zélf het bedrag in — vul{' '}
                  <strong>{euro(resultaat.bedrag)}</strong> in je bank-app in.
                </div>
              )}

              {betaal ? (
                <a
                  className="betaal-cta"
                  href={betaal.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ marginTop: 14 }}
                  onClick={() => {
                    setBetaalStap(true);
                    setUitgeklapt(false);
                    bewaarBetaalStap(rondeId, 'bank');
                  }}
                >
                  <span className="betaal-cta-main">
                    <IconLock size={18} />
                    Betaal {euro(resultaat.bedrag)} via je bank
                    <span className="betaal-cta-arrow" aria-hidden>→</span>
                  </span>
                  <span className="betaal-cta-sub">
                    Opent in een nieuw tabblad — iDEAL / je bank-app
                  </span>
                </a>
              ) : (
                <div className="notice notice-info" style={{ marginTop: 14 }}>
                  Betaal {euro(resultaat.bedrag)} via de bekende QR-code of vraag de
                  commissie.
                </div>
              )}

              {betaal && (
                <div className="betaal-veilig">
                  <IconLock size={13} /> Veilig betalen via {dienst ?? 'je eigen bank'}
                </div>
              )}
            </>
          )}
        </div>
        )}

        <p
          className="muted alleen-los"
          style={{ textAlign: 'center', fontSize: 14, marginTop: 14, marginBottom: 0 }}
        >
          Na het betalen kom je hier gewoon terug. Nummers kwijt? Zoek ze onderaan
          deze pagina op met je naam.
        </p>

        <div style={{ textAlign: 'center', marginTop: 12 }}>
          {inApp ? (
            <div className="row-actions" style={{ justifyContent: 'center' }}>
              <button className="btn btn-gold" onClick={() => opnieuw(true)}>
                Meer loten kopen
              </button>
              <button className="btn btn-ghost" onClick={() => opnieuw()}>
                Loten voor iemand anders
              </button>
            </div>
          ) : (
            <button className="btn btn-gold" onClick={() => opnieuw()}>
              Nog iemand inschrijven
            </button>
          )}
        </div>

        {hersteld && (
          <div className="alleen-los" style={{ textAlign: 'center', marginTop: 12 }}>
            <button className="knop-link" onClick={wisVanToestel}>
              Niet jouw loten? Van dit toestel wissen
            </button>
          </div>
        )}
      </>
    );
  }

  // ---------- Al bekende loten: bevestiging "dit ben ik" ----------
  if (bekend && getoond) {
    return (
      <>
        <Stappen actief={2} />
        <div className="lot-badge">
          <small>Je doet al mee!</small>
          <MijnLotenRij
            nummers={bekend}
            titel={lotenTitel(bekend.length, naam.trim())}
            donker
            groot
          />
          <small>Je doet mee met de trekking — bij het trekken roepen we ook de naam om.</small>
        </div>
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <button className="btn btn-gold" onClick={() => opnieuw()}>
            {inApp ? 'Loten voor iemand anders' : 'Nog iemand inschrijven'}
          </button>
        </div>
      </>
    );
  }

  // ---------- Zachte waarschuwing: deze naam heeft al loten ----------
  if (bekend) {
    return (
      <>
        <Stappen actief={1} />
        <div className="panel">
          <div className="notice notice-info">
            <strong>Het lijkt erop dat je al meedoet.</strong> Op de naam “
            {naam.trim()}” staan al {bekend.length} loten voor deze ronde:
            <div style={{ marginTop: 10 }}>
              <MijnLotenRij nummers={bekend} />
            </div>
          </div>
          <p className="muted">
            Heb je je per ongeluk nog een keer ingeschreven? Dan hoef je niks te
            doen — je doet al mee. Wil je tóch extra loten bijkopen, dan kan dat.
          </p>
          <div className="row-actions">
            <button className="btn" type="button" onClick={() => setGetoond(true)}>
              Dit zijn mijn loten
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={tochBijkopen}
              disabled={bezig}
            >
              {bezig ? 'Bezig…' : 'Toch een extra bundel bijkopen'}
            </button>
          </div>
        </div>
      </>
    );
  }

  // ---------- Formulier: naam + bundel ----------
  return (
    <>
      <Stappen actief={1} />

      <form className="panel" onSubmit={submit}>
        {fout && <div className="notice notice-err">{fout}</div>}

      <label htmlFor="naam">Je naam</label>
      <input
        id="naam"
        type="text"
        value={naam}
        onChange={(e) => setNaam(e.target.value)}
        placeholder="Voor- en achternaam"
        autoComplete="name"
        required
      />

      <label>Kies je bundel</label>
      <div className="bundel-grid">
        {BUNDELS.map((b) => (
          <button
            type="button"
            key={b.bedrag}
            className={`bundel-kaart ${bedrag === b.bedrag ? 'gekozen' : ''}`}
            onClick={() => setBedrag(b.bedrag)}
            aria-pressed={bedrag === b.bedrag}
          >
            <span className="bundel-bedrag">{euro(b.bedrag)}</span>
            <span className="bundel-loten">{b.loten} loten</span>
          </button>
        ))}
      </div>

        {eigenModus && (
          <div className="eigen-nummers">
            <label>Kies je {aantalNummers} lotnummers (1000–9999)</label>
            <div className="eigen-nummers-grid">
              {Array.from({ length: aantalNummers }, (_, i) => {
                const v = (eigenNummers[i] ?? '').trim();
                const isBezet = v !== '' && bezet.has(Number(v));
                return (
                  <input
                    key={i}
                    type="number"
                    min={1000}
                    max={9999}
                    inputMode="numeric"
                    placeholder="#"
                    className={isBezet ? 'nummer-bezet' : ''}
                    title={isBezet ? 'Dit nummer is al vergeven — kies een ander' : undefined}
                    value={eigenNummers[i] ?? ''}
                    onChange={(e) => {
                      const kopie = [...eigenNummers];
                      kopie[i] = e.target.value;
                      setEigenNummers(kopie);
                    }}
                  />
                );
              })}
            </div>
            {heeftBezetNummer && (
              <p className="muted" style={{ marginBottom: 0 }}>
                Nummers met een{' '}
                <span style={{ color: '#d64545', fontWeight: 700 }}>rood randje</span> zijn
                al vergeven — kies dan een ander.
              </p>
            )}
          </div>
        )}

        <div className="meedoen-knoppen" style={{ marginTop: 18 }}>
          {eigenModus ? (
            <>
              <button
                className="btn btn-groot btn-vol"
                type="button"
                onClick={bevestigEigen}
                disabled={bezig}
              >
                {bezig ? 'Bezig…' : 'Bevestig mijn nummers →'}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setEigenModus(false)}
                disabled={bezig}
              >
                Toch willekeurige nummers
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-groot btn-vol" type="submit" disabled={bezig}>
                {bezig ? 'Bezig…' : 'Naar mijn loten →'}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setEigenModus(true)}
                disabled={bezig}
              >
                Kies eigen lotnummers
              </button>
            </>
          )}
        </div>
      </form>
    </>
  );
}
