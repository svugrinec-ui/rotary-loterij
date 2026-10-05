import Link from 'next/link';
import { publicClient } from '@/lib/supabase';
import { datumLabel, maandLabel } from '@/lib/format';
import { maandVoortgang, doelVoorMaand, MAANDDOEL } from '@/lib/doel';
import { maandTotalen, huidigeEnVorige } from '@/lib/opbrengst';
import { winnaarFotos } from '@/lib/fotos';
import LiveDoelMeter from '@/components/LiveDoelMeter';
import FotoCarrousel from '@/components/FotoCarrousel';
import type { Winnaar, Doel, Ronde } from '@/lib/types';

export const revalidate = 60;

export default async function HomePage() {
  const sb = publicClient();

  const [{ data: winnaars }, { data: doelen }, { data: rondesData }] =
    await Promise.all([
      sb
        .from('winnaars')
        .select('*')
        .eq('gepubliceerd', true)
        .order('maand', { ascending: false })
        .limit(24),
      sb.from('doelen').select('*'),
      sb.from('rondes').select('*'),
    ]);

  const lijst = (winnaars as Winnaar[] | null) ?? [];
  const doelenLijst = (doelen as Doel[] | null) ?? [];
  const rondes = (rondesData as Ronde[] | null) ?? [];
  // Maanddoel-meter: de laatste maand met een ronde telt (reset per maand),
  // met de maand ervoor subtiel eronder.
  const maanden = maandTotalen(rondes, lijst);
  const { huidig, vorig } = huidigeEnVorige(maanden, new Date().toISOString().slice(0, 7));
  const voortgang = maandVoortgang(
    huidig ? [{ maand: huidig.maandIso, opbrengst: huidig.opbrengst }] : [],
  );
  const huidigDoel = doelVoorMaand(doelenLijst, voortgang.maandIso);
  const vorige = vorig
    ? { maandNaam: maandLabel(vorig.maandIso), opgehaald: vorig.opbrengst, doel: MAANDDOEL }
    : null;

  return (
    <>
      <section className="hero">
        <h1>
          Van prijzen naar <span className="gold">ervaringen</span>
        </h1>
        <p>
          Elke maand verloten we bijzondere Rotary Experiences, aangeboden door
          onze eigen leden. Hier zie je wie er won — en welke mooie ervaring ze
          deelden.
        </p>
      </section>

      <Link href="/goede-doelen" style={{ textDecoration: 'none', color: 'inherit' }}>
        <LiveDoelMeter
          start={{ voortgang, doelNaam: huidigDoel?.naam ?? null, vorige }}
          doelLabel="Deze maand voor"
        />
      </Link>

      <section>
        <div className="section-head">
          <h2>Winnaars per maand</h2>
          <span className="sub">De laatste Rotary Experiences</span>
        </div>

        {lijst.length === 0 ? (
          <div className="empty">
            Nog geen winnaars gepubliceerd. Kom snel terug — of{' '}
            <Link href="/meedoen">doe mee met de loterij</Link>.
          </div>
        ) : (
          <div className="grid">
            {lijst.map((w, i) => {
              const fotos = winnaarFotos(w);
              return (
                <article className="card" key={w.id}>
                  {fotos.length > 0 ? (
                    // Startvertraging per kaart: de galerij wisselt niet in koor.
                    <FotoCarrousel fotos={fotos} vertraging={(i % 4) * 700} />
                  ) : (
                    <div className="card-photo">
                      <span className="placeholder">🏅</span>
                    </div>
                  )}
                  <div className="card-body">
                    <span className="maand">{datumLabel(w.maand)}</span>
                    <h3>{w.experience_titel}</h3>
                    {w.aanbieder && (
                      <div className="muted" style={{ fontSize: 14 }}>
                        Aangeboden door {w.aanbieder}
                      </div>
                    )}
                    <div className="winnaar">Gewonnen door {w.naam}</div>
                    {w.toelichting && (
                      <p className="toelichting">{w.toelichting}</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
