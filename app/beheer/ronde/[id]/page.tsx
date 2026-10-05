import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { isAdmin } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase';
import { euro, maandLabel, tijdstipLabel } from '@/lib/format';
import { BUNDELS } from '@/lib/bundels';
import type { Ronde, Experience, Lot } from '@/lib/types';
import {
  maakExperience,
  wijzigExperience,
  verwijderExperience,
  zetBetaald,
  verwijderLot,
  verwijderPersoonLoten,
  zetRondeStatus,
  verwijderRonde,
} from '@/lib/actions';
import ConfirmButton from '@/components/ConfirmButton';
import Aanmeldingen from './Aanmeldingen';
import BeheerLive from '@/components/BeheerLive';

export const dynamic = 'force-dynamic';

export default async function RondeBeheerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ avond?: string; fout?: string }>;
}) {
  if (!(await isAdmin())) redirect('/beheer');
  const { id } = await params;
  const { avond, fout } = await searchParams;
  const sb = serviceClient();

  const { data: rondeData } = await sb
    .from('rondes')
    .select('*')
    .eq('id', id)
    .single();
  const ronde = rondeData as Ronde | null;
  if (!ronde) notFound();

  const [{ data: expData }, { data: lotData }] = await Promise.all([
    sb.from('experiences').select('*').eq('ronde_id', id).order('sort'),
    sb
      .from('loten')
      .select('*')
      .eq('ronde_id', id)
      .order('lotnummer', { ascending: true }),
  ]);

  const experiences = (expData as Experience[] | null) ?? [];
  const loten = (lotData as Lot[] | null) ?? [];
  const betaald = loten.filter((l) => l.betaald);
  const open = loten.length - betaald.length;

  // Opbrengst deze ronde (de week): totaal + per deelnemer.
  const totaalOpbrengst = betaald.reduce((s, l) => s + Number(l.bedrag ?? 0), 0);
  // Splitsing cash vs bank (voor het afstemmen — cash zit niet op het bankafschrift).
  const cashOpbrengst =
    Math.round(
      betaald
        .filter((l) => l.betaalwijze === 'cash')
        .reduce((s, l) => s + Number(l.bedrag ?? 0), 0) * 100,
    ) / 100;
  const bankOpbrengst = Math.round((totaalOpbrengst - cashOpbrengst) * 100) / 100;
  const perPersoonMap: Record<string, { naam: string; aantal: number; bedrag: number }> = {};
  for (const l of betaald) {
    const r = (perPersoonMap[l.naam] ??= { naam: l.naam, aantal: 0, bedrag: 0 });
    r.aantal += 1;
    r.bedrag += Number(l.bedrag ?? 0);
  }
  const perPersoon = Object.values(perPersoonMap).sort((a, b) => b.bedrag - a.bedrag);

  // Loten per deelnemer (voor de inklapbare loten-lijst). We vlaggen op TOTAAL:
  // klopt het aantal loten met één bundel (3/7/11/15)? Zo niet, dan is het
  // opvallend (bijv. 6 = twee keer ingeschreven). Robuust bij handmatig wissen:
  // haal je van 6 terug naar 3, dan verdwijnt de vlag vanzelf.
  const bundelMaten = new Set(BUNDELS.map((b) => b.loten));
  const lotenPerPersoonMap: Record<string, Lot[]> = {};
  for (const l of loten) (lotenPerPersoonMap[l.naam] ??= []).push(l);
  const deelnemers = Object.entries(lotenPerPersoonMap)
    .map(([naam, ls]) => {
      const tijden = [...new Set(ls.map((l) => l.created_at))].sort();
      const totaalBedrag =
        Math.round(ls.reduce((s, l) => s + Number(l.bedrag ?? 0), 0) * 100) / 100;
      return {
        naam,
        loten: [...ls].sort((a, b) => a.lotnummer - b.lotnummer),
        betaald: ls.filter((l) => l.betaald).length,
        tijden,
        totaalBedrag,
        opvallend: !bundelMaten.has(ls.length), // aantal past niet bij één bundel
      };
    })
    .sort((a, b) => a.naam.localeCompare(b.naam));

  return (
    <>
      <p style={{ marginTop: 20 }}>
        <Link href="/beheer">← Terug naar beheer</Link>
      </p>
      {fout === 'hoofdprijs' && (
        <div className="notice notice-err">
          Deze ronde heeft nog geen hoofdprijs. Voeg hieronder eerst een experience toe; daarna kun je de ronde openen.
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <h1 style={{ margin: 0 }}>
          {ronde.naam}{' '}
          <span className="muted" style={{ fontWeight: 400, fontSize: 18 }}>
            · {maandLabel(ronde.maand)}
          </span>
        </h1>
        <div className="row-actions">
          {ronde.status === 'open' ? (
            <form action={zetRondeStatus}>
              <input type="hidden" name="id" value={ronde.id} />
              <input type="hidden" name="status" value="gesloten" />
              <button className="btn btn-ghost btn-sm">Ronde sluiten</button>
            </form>
          ) : (
            <form action={zetRondeStatus}>
              <input type="hidden" name="id" value={ronde.id} />
              <input type="hidden" name="status" value="open" />
              <button className="btn btn-ghost btn-sm">Ronde heropenen</button>
            </form>
          )}
        </div>
      </div>

      {/* ---------- Loten ---------- */}
      <section>
        <div className="section-head">
          <h2>Loten</h2>
          <span className="sub">
            {loten.length} totaal · {betaald.length} betaald · {open} open
          </span>
        </div>

        {loten.length === 0 ? (
          <div className="empty">Nog geen loten. Bezoekers schrijven zich in via /meedoen.</div>
        ) : (
          deelnemers.map((p) => (
            <details className="loten-persoon" key={p.naam}>
              <summary>
                <span className="loten-persoon-naam">
                  {p.naam}
                  {p.opvallend && (
                    <span className="pill pill-flag" title="Aantal loten past niet bij één bundel — controleer of dit een dubbele inschrijving is">
                      ⚠ {p.loten.length} loten — controleren
                    </span>
                  )}
                </span>
                <span className="muted">
                  {p.loten.length} {p.loten.length === 1 ? 'lot' : 'loten'}
                  {p.betaald < p.loten.length ? ` · ${p.loten.length - p.betaald} open` : ''}
                </span>
              </summary>

              <div className="inschrijvingen">
                <span className="muted">
                  {p.tijden.length > 1 ? 'Ingeschreven op' : 'Ingeschreven'}:{' '}
                  {p.tijden.map((t) => tijdstipLabel(t)).join(' · ')} · totaal{' '}
                  <strong>{euro(p.totaalBedrag)}</strong>
                  {p.tijden.length > 1 && ` · ${p.tijden.length} keer`}
                </span>
              </div>

              <div className="loten-lijst">
                {p.loten.map((l) => (
                  <div className="lot-regel" key={l.id}>
                    <strong>#{l.lotnummer}</strong>
                    <span className={`pill ${l.betaald ? 'pill-ok' : 'pill-wait'}`}>
                      {l.betaald ? 'Betaald' : 'Open'}
                    </span>
                    {l.betaalwijze === 'cash' && (
                      <span className="pill pill-cash">contant</span>
                    )}
                    <div className="row-actions" style={{ marginLeft: 'auto' }}>
                      <form action={zetBetaald}>
                        <input type="hidden" name="id" value={l.id} />
                        <input type="hidden" name="ronde_id" value={ronde.id} />
                        <input type="hidden" name="betaald" value={(!l.betaald).toString()} />
                        <button className={`btn btn-sm ${l.betaald ? 'btn-ghost' : ''}`}>
                          {l.betaald ? 'Zet op open' : 'Afvinken'}
                        </button>
                      </form>
                      <form action={verwijderLot}>
                        <input type="hidden" name="id" value={l.id} />
                        <input type="hidden" name="ronde_id" value={ronde.id} />
                        <button className="btn btn-danger btn-sm">✕</button>
                      </form>
                    </div>
                  </div>
                ))}

                <form action={verwijderPersoonLoten} style={{ marginTop: 10 }}>
                  <input type="hidden" name="ronde_id" value={ronde.id} />
                  <input type="hidden" name="naam" value={p.naam} />
                  <ConfirmButton
                    className="btn btn-ghost btn-sm"
                    message={`Alle ${p.loten.length} loten van ${p.naam} verwijderen? (bijv. een dubbele inschrijving)`}
                  >
                    Alle loten van {p.naam} verwijderen
                  </ConfirmButton>
                </form>
              </div>
            </details>
          ))
        )}
      </section>

      {/* ---------- Wie komt er, en doet al mee? (koppeling club-app) ---------- */}
      <Aanmeldingen ronde={ronde} loten={loten} gekozen={avond} />
      <BeheerLive rondeIds={[ronde.id]} />

      {/* ---------- Opbrengst deze ronde ---------- */}
      <section>
        <div className="section-head">
          <h2>Opbrengsten</h2>
          <span className="sub">
            {euro(totaalOpbrengst)} · {betaald.length} betaalde loten ·{' '}
            {perPersoon.length} deelnemers
          </span>
        </div>
        {betaald.length > 0 && (
          <div className="opbrengst-split">
            <span className="split-blok">
              <span className="muted">Bank</span> <strong>{euro(bankOpbrengst)}</strong>
            </span>
            <span className="split-blok">
              <span className="muted">Contant</span> <strong>{euro(cashOpbrengst)}</strong>
            </span>
          </div>
        )}
        {perPersoon.length === 0 ? (
          <div className="empty">Nog geen betaalde inschrijvingen deze ronde.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Deelnemer</th>
                  <th>Loten</th>
                  <th style={{ textAlign: 'right' }}>Betaald</th>
                </tr>
              </thead>
              <tbody>
                {perPersoon.map((r) => (
                  <tr key={r.naam}>
                    <td>{r.naam}</td>
                    <td>{r.aantal}</td>
                    <td style={{ textAlign: 'right' }}>{euro(r.bedrag)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td><strong>Totaal</strong></td>
                  <td><strong>{betaald.length}</strong></td>
                  <td style={{ textAlign: 'right' }}>
                    <strong>{euro(totaalOpbrengst)}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* ---------- Experiences ---------- */}
      <section>
        <div className="section-head">
          <h2>Experiences</h2>
          <span className="sub">Wat er te winnen is deze ronde</span>
        </div>
        {experiences.map((e) => (
          <form className="panel" action={wijzigExperience} key={e.id}>
            <input type="hidden" name="id" value={e.id} />
            <input type="hidden" name="ronde_id" value={ronde.id} />
            <div className="inline-form">
              <div>
                <label>Titel</label>
                <input name="titel" type="text" defaultValue={e.titel} required />
              </div>
              <div>
                <label>Aanbieder</label>
                <input name="aanbieder" type="text" defaultValue={e.aanbieder ?? ''} />
              </div>
            </div>
            <label>Omschrijving</label>
            <input name="omschrijving" type="text" defaultValue={e.omschrijving ?? ''} />
            <div className="row-actions" style={{ marginTop: 14 }}>
              <button className="btn" type="submit">
                Opslaan
              </button>
              <button
                className="btn btn-danger btn-sm"
                formAction={verwijderExperience}
                formNoValidate
              >
                Verwijder
              </button>
            </div>
          </form>
        ))}

        {experiences.length === 0 && (
        <form className="panel" action={maakExperience}>
          <input type="hidden" name="ronde_id" value={ronde.id} />
          <h3 style={{ marginTop: 0 }}>Experience toevoegen</h3>
          <div className="inline-form">
            <div>
              <label>Titel</label>
              <input name="titel" type="text" placeholder="Golf Experience met Stephen" required />
            </div>
            <div>
              <label>Aanbieder</label>
              <input name="aanbieder" type="text" placeholder="Lid" required />
            </div>
          </div>
          <label>Omschrijving</label>
          <input name="omschrijving" type="text" />
          <div style={{ marginTop: 14 }}>
            <button className="btn" type="submit">
              Toevoegen
            </button>
          </div>
        </form>
        )}
      </section>

      {/* ---------- Verwijderen (alleen voor testrondes) ---------- */}
      <details className="ronde-verwijder" style={{ marginTop: 28 }}>
        <summary className="muted" style={{ cursor: 'pointer', fontSize: 14 }}>
          Ronde verwijderen
        </summary>
        <div className="panel" style={{ marginTop: 10 }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Alleen voor test- of foutieve rondes. Dit verwijdert de loten,
            experiences én de winnaar van deze ronde (incl. de opbrengst) —
            definitief, geen ongedaan maken. Wil je alleen iets corrigeren,
            pas het dan hierboven aan.
          </p>
          <form action={verwijderRonde}>
            <input type="hidden" name="id" value={ronde.id} />
            <ConfirmButton
              className="btn btn-danger btn-sm"
              message={`Ronde "${ronde.naam}" verwijderen? De loten, experiences én de winnaar van deze ronde (incl. de opbrengst in het overzicht) gaan mee.`}
            >
              Ja, verwijder deze ronde
            </ConfirmButton>
          </form>
        </div>
      </details>
    </>
  );
}
