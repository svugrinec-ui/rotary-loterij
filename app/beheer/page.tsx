import Link from 'next/link';
import { isAdmin } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase';
import { euro, maandLabel, datumLabel } from '@/lib/format';
import { BUNDELS } from '@/lib/bundels';
import {
  getInstellingen,
  MAIL_INTRO_STANDAARD,
  MAIL_AFSLUITING_STANDAARD,
} from '@/lib/instellingen';
import { IconTrophy } from '@/components/Icons';
import ExportMailKnop from './ExportMailKnop';
import FotoKiezer from '@/components/FotoKiezer';
import WinnaarRondeKeuze from '@/components/WinnaarRondeKeuze';
import type { Ronde, Doel, Winnaar, TrekkingLive } from '@/lib/types';
import {
  login,
  logout,
  maakRonde,
  zetRondeStatus,
  maakDoel,
  wijzigDoel,
  verwijderDoel,
  zetWinnaarPublicatie,
  maakWinnaar,
  wijzigInstellingen,
} from '@/lib/actions';

export const dynamic = 'force-dynamic';

const statusLabel: Record<string, string> = {
  open: 'Open',
  gesloten: 'Gesloten',
  getrokken: 'Getrokken',
};

export default async function BeheerPage({
  searchParams,
}: {
  searchParams: Promise<{ fout?: string }>;
}) {
  const { fout } = await searchParams;

  if (!(await isAdmin())) {
    return (
      <section style={{ maxWidth: 420, margin: '40px auto' }}>
        <div className="section-head">
          <h2>Commissie-beheer</h2>
        </div>
        <form className="panel" action={login}>
          {fout === 'wachtwoord' && (
            <div className="notice notice-err">Onjuist wachtwoord.</div>
          )}
          <label htmlFor="password">Wachtwoord</label>
          <input id="password" name="password" type="password" required autoFocus />
          <div style={{ marginTop: 16 }}>
            <button className="btn" type="submit">
              Inloggen
            </button>
          </div>
        </form>
      </section>
    );
  }

  const sb = serviceClient();
  const [{ data: rondesData }, { data: doelenData }, { data: winnaarsData }] =
    await Promise.all([
      sb.from('rondes').select('*').order('maand', { ascending: false }),
      sb
        .from('doelen')
        .select('*')
        .order('maand', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false }),
      sb.from('winnaars').select('*').order('maand', { ascending: false }),
    ]);

  const rondes = (rondesData as Ronde[] | null) ?? [];
  const doelen = (doelenData as Doel[] | null) ?? [];
  const winnaars = (winnaarsData as Winnaar[] | null) ?? [];

  /**
   * Het formulier "Winnaar toevoegen" vult zich met de laatste trekking, zodat
   * je na de show alleen nog foto's hoeft te kiezen. Alleen als die ronde nog
   * geen winnaar in de galerij heeft — anders zou je een dubbele maken.
   */
  const { data: liveData } = await sb
    .from('trekking_live')
    .select('*')
    .order('bijgewerkt_op', { ascending: false })
    .limit(1);
  const laatste = ((liveData as TrekkingLive[] | null) ?? [])[0] ?? null;
  const trekkingRonde = laatste
    ? rondes.find((r) => r.id === laatste.ronde_id) ?? null
    : null;
  const alInGalerij = laatste
    ? winnaars.some((w) => w.ronde_id === laatste.ronde_id)
    : false;
  const suggestie =
    laatste?.winnaar_naam && trekkingRonde && !alInGalerij
      ? { naam: laatste.winnaar_naam, ronde: trekkingRonde }
      : null;

  // De hoofdprijs van die ronde: titel + aanbieder voor het formulier.
  let suggestieExperience: { titel: string; aanbieder: string | null } | null = null;
  if (suggestie) {
    const { data: expData } = await sb
      .from('experiences')
      .select('titel, aanbieder')
      .eq('ronde_id', suggestie.ronde.id)
      .order('sort', { ascending: true })
      .limit(1);
    suggestieExperience =
      ((expData as { titel: string; aanbieder: string | null }[] | null) ?? [])[0] ??
      null;
  }
  const instellingen = await getInstellingen();
  const vandaag = new Date().toISOString().slice(0, 10);
  const dezeMaand = vandaag.slice(0, 8) + '01';
  // Snelknop trekking hoort bij een lopende (open) loterijronde.
  const openRonde = rondes.find((r) => r.status === 'open') ?? null;

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 24,
        }}
      >
        <h1 style={{ margin: 0 }}>Commissie-beheer</h1>
        <div className="row-actions">
          <form action={logout}>
            <button className="btn btn-ghost btn-sm" type="submit">
              Uitloggen
            </button>
          </form>
        </div>
      </div>

      {/* ---------- Snelknoppen: live trekking + inschrijf-QR ---------- */}
      <div style={{ display: 'flex', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
        {openRonde ? (
          <Link
            className="btn btn-gold btn-groot"
            href={`/beheer/ronde/${openRonde.id}/trekking`}
            style={{ display: 'flex', flex: 1, minWidth: 220, justifyContent: 'center' }}
          >
            <IconTrophy size={20} /> Start trekking — {openRonde.naam}
          </Link>
        ) : (
          <button
            className="btn btn-gold btn-groot"
            disabled
            style={{ display: 'flex', flex: 1, minWidth: 220, justifyContent: 'center' }}
            title="Open eerst een loterijronde om te trekken"
          >
            <IconTrophy size={20} /> Start trekking — geen open ronde
          </button>
        )}
        <Link
          className="btn btn-groot"
          href="/beheer/qr"
          style={{ display: 'flex', justifyContent: 'center', whiteSpace: 'nowrap' }}
          title="Toon de QR-code om mee te doen — voor wie de link niet kan vinden"
        >
          Inschrijf-QR
        </Link>
      </div>

      {/* ---------- Rondes ---------- */}
      <section>
        <div className="section-head">
          <h2>Loterijrondes</h2>
          <span className="sub">Open een ronde, beheer loten en trek winnaars</span>
        </div>

        {rondes.length > 0 && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th title="Aanvinken voor de CSV-export">Export</th>
                  <th>Ronde</th>
                  <th>Maand</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rondes.map((r) => (
                  <tr key={r.id}>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        name="ronde"
                        value={r.id}
                        aria-label={`Exporteer ${r.naam}`}
                      />
                    </td>
                    <td>
                      <Link href={`/beheer/ronde/${r.id}`}>{r.naam}</Link>
                    </td>
                    <td>{maandLabel(r.maand)}</td>
                    <td>
                      <span
                        className={`pill ${
                          r.status === 'open' ? 'pill-ok' : 'pill-wait'
                        }`}
                      >
                        {statusLabel[r.status]}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link
                          className="btn btn-ghost btn-sm"
                          href={`/beheer/ronde/${r.id}`}
                        >
                          Beheer
                        </Link>
                        {r.status !== 'open' && (
                          <form action={zetRondeStatus}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="status" value="open" />
                            <button className="btn btn-ghost btn-sm">Open</button>
                          </form>
                        )}
                        {r.status === 'open' && (
                          <form action={zetRondeStatus}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="status" value="gesloten" />
                            <button className="btn btn-ghost btn-sm">Sluit</button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rondes.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <ExportMailKnop />
          </div>
        )}

        <form className="panel" action={maakRonde}>
          <h3 style={{ marginTop: 0 }}>Nieuwe ronde</h3>
          <div className="inline-form">
            <div>
              <label htmlFor="r-naam">Naam</label>
              <input id="r-naam" name="naam" type="text" placeholder="Rotary avond" required />
            </div>
            <div>
              <label htmlFor="r-maand">Datum</label>
              <input id="r-maand" name="maand" type="date" defaultValue={dezeMaand} required />
            </div>
          </div>
          <div className="inline-form">
            <div>
              <label htmlFor="r-exp">Hoofdprijs (experience)</label>
              <input
                id="r-exp"
                name="experience"
                type="text"
                placeholder="Onvergetelijke ervaring"
                required
              />
            </div>
            <div>
              <label htmlFor="r-aanb">Aangeboden door</label>
              <input id="r-aanb" name="aanbieder" type="text" placeholder="Rotarian" required />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <button className="btn" type="submit">
              Ronde toevoegen
            </button>
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            Elke ronde gebruikt dezelfde lotbundels:{' '}
            {BUNDELS.map((b) => `${euro(b.bedrag)} = ${b.loten} loten`).join(' · ')}.
          </p>
        </form>
      </section>

      {/* ---------- Winnaars ---------- */}
      <section>
        <div className="section-head">
          <h2>Winnaars-galerij</h2>
          <span className="sub">Publiceer winnaars met foto&apos;s</span>
        </div>

        {winnaars.length > 0 && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Winnaar</th>
                  <th>Experience</th>
                  <th>Zichtbaar</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {winnaars.map((w) => (
                  <tr key={w.id}>
                    <td>{datumLabel(w.maand)}</td>
                    <td>{w.naam}</td>
                    <td>{w.experience_titel}</td>
                    <td>
                      <span className={`pill ${w.gepubliceerd ? 'pill-ok' : 'pill-wait'}`}>
                        {w.gepubliceerd ? 'Online' : 'Verborgen'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link className="btn btn-ghost btn-sm" href={`/beheer/winnaar/${w.id}`}>
                          Bewerk
                        </Link>
                        <form action={zetWinnaarPublicatie}>
                          <input type="hidden" name="id" value={w.id} />
                          <input
                            type="hidden"
                            name="gepubliceerd"
                            value={(!w.gepubliceerd).toString()}
                          />
                          <button className="btn btn-ghost btn-sm">
                            {w.gepubliceerd ? 'Verberg' : 'Publiceer'}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="muted">
          Winnaars komen normaal uit de{' '}
          <span style={{ fontWeight: 600 }}>presentatie-trekking</span> — die zet ze
          er aan het eind zelf in. Is dat scherm te vroeg gesloten, of trok je
          zonder de app? Dan voeg je de winnaar hieronder alsnog toe.
        </p>

        <form className="panel" action={maakWinnaar} key={suggestie?.ronde.id ?? 'leeg'}>
          <h3 style={{ marginTop: 0 }}>Winnaar toevoegen</h3>

          {suggestie && (
            <div className="notice notice-ok">
              Ingevuld met de trekking van{' '}
              <strong>{datumLabel(suggestie.ronde.maand)}</strong> —{' '}
              {suggestie.naam} won de hoofdprijs. Klopt er iets niet? Pas het
              gewoon aan.
            </div>
          )}

          <div className="inline-form">
            <div>
              <label htmlFor="w-maand">Datum trekking</label>
              <input
                id="w-maand"
                name="maand"
                type="date"
                defaultValue={suggestie?.ronde.maand.slice(0, 10) ?? vandaag}
                required
              />
            </div>
            <div>
              <label htmlFor="w-naam">Naam winnaar</label>
              <input
                id="w-naam"
                name="naam"
                type="text"
                defaultValue={suggestie?.naam ?? ''}
                required
              />
            </div>
          </div>

          <WinnaarRondeKeuze
            rondes={rondes.map((r) => ({ id: r.id, maand: r.maand, naam: r.naam }))}
            standaard={suggestie?.ronde.id ?? ''}
          />

          <div className="inline-form" style={{ marginTop: 12 }}>
            <div>
              <label htmlFor="w-exp">Experience</label>
              <input
                id="w-exp"
                name="experience_titel"
                type="text"
                defaultValue={suggestieExperience?.titel ?? ''}
                required
              />
            </div>
            <div>
              <label htmlFor="w-aanbieder">Aangeboden door</label>
              <input
                id="w-aanbieder"
                name="aanbieder"
                type="text"
                defaultValue={suggestieExperience?.aanbieder ?? ''}
              />
            </div>
          </div>

          <label htmlFor="w-toelichting">Toelichting (optioneel)</label>
          <textarea id="w-toelichting" name="toelichting" placeholder="Kort verhaaltje bij de foto's" />

          <label>Foto&apos;s (optioneel) — meerdere tegelijk mag</label>
          <FotoKiezer multiple />

          <div style={{ marginTop: 14 }}>
            <button className="btn" type="submit">
              Winnaar publiceren
            </button>
          </div>
        </form>
      </section>

      {/* ---------- Goede doelen (ingeklapt) ---------- */}
      <details className="beheer-inklap">
        <summary>Goede doelen — waar het geld per maand naartoe gaat</summary>
        <div style={{ marginTop: 6 }} />

        <form className="panel" action={maakDoel}>
          <h3 style={{ marginTop: 0 }}>Nieuw goed doel</h3>
          <div className="inline-form">
            <div>
              <label>Naam</label>
              <input name="naam" type="text" required />
            </div>
            <div>
              <label>Maand</label>
              <input name="maand" type="month" defaultValue={dezeMaand.slice(0, 7)} />
            </div>
          </div>
          <label>Omschrijving</label>
          <input name="omschrijving" type="text" placeholder="Korte toelichting op het doel (optioneel)" />
          <label>Foto (optioneel)</label>
          <FotoKiezer />
          <input type="hidden" name="jaar" value={new Date().getFullYear()} />
          <div style={{ marginTop: 14 }}>
            <button className="btn" type="submit">
              Doel toevoegen
            </button>
          </div>
        </form>

        {doelen.map((d) => (
          <form className="panel" action={wijzigDoel} key={d.id}>
            <input type="hidden" name="id" value={d.id} />
            <div className="inline-form">
              <div>
                <label>Naam</label>
                <input name="naam" type="text" defaultValue={d.naam} required />
              </div>
              <div>
                <label>Maand</label>
                <input name="maand" type="month" defaultValue={d.maand?.slice(0, 7) ?? ''} />
              </div>
            </div>
            <label>Omschrijving</label>
            <input name="omschrijving" type="text" defaultValue={d.omschrijving ?? ''} />
            {d.foto_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={d.foto_url}
                alt=""
                style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, margin: '10px 0 0' }}
              />
            )}
            <label>{d.foto_url ? 'Foto vervangen (optioneel)' : 'Foto toevoegen (optioneel)'}</label>
            <FotoKiezer />
            <input type="hidden" name="jaar" value={d.jaar ?? ''} />
            <div className="row-actions" style={{ marginTop: 14 }}>
              <button className="btn btn-sm" type="submit">
                Opslaan
              </button>
              <button className="btn btn-danger btn-sm" formAction={verwijderDoel}>
                Verwijderen
              </button>
            </div>
          </form>
        ))}
      </details>

      {/* ---------- Instellingen: penningmeester & mail (ingeklapt) ---------- */}
      <details className="beheer-inklap">
        <summary>Instellingen — penningmeester &amp; e-mail</summary>
        <form className="panel" action={wijzigInstellingen}>
          <p className="muted" style={{ marginTop: 0 }}>
            Naar dit adres wordt het financiële overzicht gemaild (knop bij de
            loterijrondes). De geheime mailsleutel staat los in de omgeving.
          </p>
          <div className="inline-form">
            <div>
              <label htmlFor="pm-naam">Naam penningmeester</label>
              <input
                id="pm-naam"
                name="penningmeester_naam"
                type="text"
                defaultValue={instellingen?.penningmeester_naam ?? ''}
                placeholder="Voor- en achternaam"
              />
            </div>
            <div>
              <label htmlFor="pm-email">E-mail penningmeester</label>
              <input
                id="pm-email"
                name="penningmeester_email"
                type="email"
                defaultValue={instellingen?.penningmeester_email ?? ''}
                placeholder="penningmeester@voorbeeld.nl"
              />
            </div>
          </div>
          <label htmlFor="pm-afzender">Afzenderadres (optioneel)</label>
          <input
            id="pm-afzender"
            name="afzender"
            type="text"
            defaultValue={instellingen?.afzender ?? ''}
            placeholder="Rotary Loterij <loterij@jullie-domein.nl>"
          />
          <p className="muted">
            Alleen invullen als je een eigen (in Resend geverifieerd) domein
            gebruikt. Leeg laten = de standaard test-afzender.
          </p>

          <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '20px 0' }} />
          <h3 style={{ marginTop: 0 }}>Mailtekst</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Zo begint en eindigt de mail. De gebrande koptekst en het overzicht
            per avond (naam, datum, opbrengst) worden automatisch toegevoegd.
            Leeg laten = de standaardtekst.
          </p>
          <label htmlFor="mail-intro">Intro-tekst</label>
          <textarea
            id="mail-intro"
            name="mail_intro"
            rows={3}
            defaultValue={instellingen?.mail_intro ?? ''}
            placeholder={MAIL_INTRO_STANDAARD}
          />
          <label htmlFor="mail-afsluiting">Afsluiting</label>
          <textarea
            id="mail-afsluiting"
            name="mail_afsluiting"
            rows={2}
            defaultValue={instellingen?.mail_afsluiting ?? ''}
            placeholder={MAIL_AFSLUITING_STANDAARD}
          />

          <div style={{ marginTop: 14 }}>
            <button className="btn" type="submit">
              Opslaan
            </button>
          </div>
        </form>
      </details>
    </>
  );
}
