import Link from 'next/link';
import { haalAvonden, vergelijk } from '@/lib/aanmeldingen';
import type { Lot, Ronde } from '@/lib/types';
import HerinneringKnop from './HerinneringKnop';

const datum = (iso: string) =>
  new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Amsterdam' }).format(new Date(iso));
const dagVan = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });

/** Wie heeft zich aangemeld voor de clubavond, en doet al mee met de loterij? */
export default async function Aanmeldingen({
  ronde,
  loten,
  gekozen,
}: {
  ronde: Ronde;
  loten: Lot[];
  gekozen?: string;
}) {
  const maand = ronde.maand.slice(0, 7);
  const { avonden, fout } = await haalAvonden(maand);

  if (fout === 'niet-ingesteld') {
    return (
      <section>
        <div className="section-head">
          <h2>Aanmeldingen clubavond</h2>
        </div>
        <div className="notice notice-info">
          De koppeling met de club-app is nog niet ingesteld (PLATFORM_URL en LOTERIJ_KOPPELSLEUTEL).
        </div>
      </section>
    );
  }

  const vandaag = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
  const avond =
    avonden.find((a) => a.id === gekozen) ??
    avonden.find((a) => dagVan(a.begin_op) === ronde.maand.slice(0, 10)) ??
    avonden.find((a) => dagVan(a.begin_op) >= vandaag) ??
    avonden[avonden.length - 1];

  // Eén regel per deelnemer (naam + contact), niet per lot.
  const deelnemers = [...new Map(loten.map((l) => [`${l.naam}|${l.contact ?? ''}`, { naam: l.naam, contact: l.contact }])).values()];
  const uitslag = avond ? vergelijk(avond.leden, deelnemers) : [];
  const geenLot = uitslag.filter((u) => u.status === 'geen-lot');
  const twijfel = uitslag.filter((u) => u.status === 'controleren');
  const mee = uitslag.filter((u) => u.status === 'meedoen');

  return (
    <section>
      <div className="section-head">
        <h2>Aanmeldingen clubavond</h2>
        {avond && (
          <span className="sub">
            {avond.leden.length} aangemeld · {mee.length} doen mee
          </span>
        )}
      </div>

      {fout ? (
        <div className="notice notice-err">De aanmeldingen konden niet worden opgehaald ({fout}).</div>
      ) : avonden.length === 0 ? (
        <div className="empty">Geen clubavonden met aanmelding in deze maand.</div>
      ) : (
        <>
          {avonden.length > 1 && (
            <div className="row-actions" style={{ marginBottom: 12 }}>
              {avonden.map((a) => (
                <Link
                  key={a.id}
                  href={`?avond=${a.id}#aanmeldingen`}
                  className={`btn btn-sm ${a.id === avond?.id ? '' : 'btn-ghost'}`}
                  scroll={false}
                >
                  {datum(a.begin_op)}
                </Link>
              ))}
            </div>
          )}
          {avond && (
            <div className="panel" id="aanmeldingen">
              <p className="sub" style={{ marginTop: 0 }}>
                {avond.titel} · {datum(avond.begin_op)}
              </p>
              <Lijst titel="Aangemeld, nog geen lot" klasse="pill-flag" mensen={geenLot.map((u) => ({ naam: u.naam }))} leeg="Iedereen die komt doet al mee." />
              {/* Alleen bij de avond van déze ronde, en alleen als je nog loten kunt kopen. */}
              {geenLot.length > 0 && avond.id === ronde.bijeenkomst_id && ronde.status === 'open' && (
                <div style={{ margin: '-6px 0 14px' }}>
                  <HerinneringKnop rondeId={ronde.id} avondId={avond.id} />
                </div>
              )}
              {twijfel.length > 0 && (
                <Lijst
                  titel="Controleren (naam lijkt erop)"
                  klasse="pill-wait"
                  mensen={twijfel.map((u) => ({ naam: u.naam, extra: `lot op naam van "${u.lot}"` }))}
                />
              )}
              <Lijst titel="Doet mee" klasse="pill-ok" mensen={mee.map((u) => ({ naam: u.naam }))} leeg="Nog niemand." />
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Lijst({
  titel,
  klasse,
  mensen,
  leeg,
}: {
  titel: string;
  klasse: string;
  mensen: { naam: string; extra?: string }[];
  leeg?: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <strong>
        {titel} <span className={`pill ${klasse}`} style={{ marginLeft: 6 }}>{mensen.length}</span>
      </strong>
      {mensen.length === 0 ? (
        leeg && <p className="sub" style={{ margin: '6px 0 0' }}>{leeg}</p>
      ) : (
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          {mensen.map((m) => (
            <li key={m.naam}>
              {m.naam}
              {m.extra && <span className="sub"> · {m.extra}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
