import { publicClient } from '@/lib/supabase';
import { maandVoortgang, doelVoorMaand, MAANDDOEL } from '@/lib/doel';
import { maandTotalen, huidigeEnVorige } from '@/lib/opbrengst';
import { maandLabel } from '@/lib/format';
import LiveDoelMeter from '@/components/LiveDoelMeter';
import TrekkingOfPagina from '@/components/TrekkingOfPagina';
import type { Ronde, Experience, Winnaar, Doel } from '@/lib/types';
import MeedoenForm from './MeedoenForm';
import LotenOpzoeken from './LotenOpzoeken';
import LoterijMeldingen from '@/components/LoterijMeldingen';
import { publiekeSleutel } from '@/lib/push';
import { getBetaalLinks } from '@/lib/instellingen';

export const revalidate = 30;

export default async function MeedoenPage() {
  const sb = publicClient();

  const [{ data: rondesData }, { data: winnaars }, { data: doelen }, betaalLinks] = await Promise.all([
    sb.from('rondes').select('*').order('maand', { ascending: false }),
    sb.from('winnaars').select('maand,opbrengst,ronde_id').eq('gepubliceerd', true),
    sb.from('doelen').select('*'),
    getBetaalLinks(),
  ]);

  const rondesAll = (rondesData as Ronde[] | null) ?? [];
  const ronde = rondesAll.find((r) => r.status === 'open') ?? null;
  const doelenLijst = (doelen as Doel[] | null) ?? [];

  // Maanddoel-meter: laatste maand met een ronde (reset per maand) + vorige maand.
  const winnaarsLijst =
    (winnaars as Pick<Winnaar, 'maand' | 'opbrengst' | 'ronde_id'>[] | null) ?? [];
  const maanden = maandTotalen(rondesAll, winnaarsLijst);
  const { huidig, vorig } = huidigeEnVorige(maanden, new Date().toISOString().slice(0, 7));
  const voortgang = maandVoortgang(
    huidig ? [{ maand: huidig.maandIso, opbrengst: huidig.opbrengst }] : [],
  );
  const vorige = vorig
    ? { maandNaam: maandLabel(vorig.maandIso), opgehaald: vorig.opbrengst, doel: MAANDDOEL }
    : null;
  const huidigDoel = doelVoorMaand(doelenLijst, ronde?.maand ?? voortgang.maandIso);

  let experiences: Experience[] = [];
  if (ronde) {
    const { data: exp } = await sb
      .from('experiences')
      .select('*')
      .eq('ronde_id', ronde.id)
      .order('sort', { ascending: true });
    experiences = (exp as Experience[] | null) ?? [];
  }

  if (!ronde) {
    return (
      <>
        <section className="hero">
          <h1>Meedoen met de loterij</h1>
          <p>Op dit moment is er geen loterijronde open. Kom snel terug!</p>
        </section>
      </>
    );
  }

  return (
    // Tijdens de trekking vervangt de trekking deze hele pagina: geen verkoop
    // meer, en niemand hoeft ergens op te klikken.
    <TrekkingOfPagina>
      <section className="hero">
        <h1>
          Doe mee — <span className="gold">{ronde.naam}</span>
        </h1>
        <p>
          Vul je naam in en kies een bundel — je krijgt <strong>direct</strong> je
          lotnummers. Daarna betaal je met één tik via je bank.
        </p>
      </section>

      <LiveDoelMeter
        start={{ voortgang, doelNaam: huidigDoel?.naam ?? null, vorige }}
        maand={ronde.maand}
        titel="Samen naar het maanddoel"
        motiverend
      />

      {experiences.length > 0 && (
        <section>
          <div className="section-head">
            <h2>Dit kun je winnen</h2>
          </div>
          <div className="grid">
            {experiences.map((e) => (
              <article className="card" key={e.id}>
                <div className="card-body">
                  <h3>{e.titel}</h3>
                  {e.aanbieder && (
                    <div className="winnaar">Aangeboden door {e.aanbieder}</div>
                  )}
                  {e.omschrijving && (
                    <p className="toelichting">{e.omschrijving}</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="section-head">
          <h2>Steun het goede doel</h2>
        </div>
        <MeedoenForm rondeId={ronde.id} betaalLinks={betaalLinks} />
        <LotenOpzoeken />

        <p className="muted" style={{ textAlign: 'center', marginTop: 18 }}>
          Trekkingsavond? Zodra de commissie begint, verschijnt de trekking hier
          op deze pagina — met jouw lotnummers erbij. Je hoeft niets te doen.
        </p>
      </section>

      {publiekeSleutel() && (
        <LoterijMeldingen publiekeSleutel={publiekeSleutel()} />
      )}
    </TrekkingOfPagina>
  );
}
