import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';

export const runtime = 'nodejs';

// Zoekt de lotnummers van een naam in de lopende (open) ronde. Met `ronde_id`
// kan het ook een andere ronde zijn — de live-trekking gebruikt dat, want die
// ronde is dan meestal al gesloten.
export async function POST(req: Request) {
  let naam = '';
  let email = '';
  let rondeIdParam = '';
  try {
    const body = await req.json();
    naam = (body.naam ?? '').toString().trim();
    rondeIdParam = (body.ronde_id ?? '').toString().trim();
    email = (body.email ?? '').toString().trim().toLowerCase();
  } catch {
    /* leeg */
  }
  if (!naam) {
    return NextResponse.json({ error: 'Vul je naam in.' }, { status: 400 });
  }

  const sb = serviceClient();

  const vraag = sb.from('rondes').select('id, naam');
  const { data: rondes } = rondeIdParam
    ? await vraag.eq('id', rondeIdParam).limit(1)
    : await vraag
        .eq('status', 'open')
        .order('maand', { ascending: false })
        .limit(1);
  const ronde = rondes?.[0];
  if (!ronde) {
    return NextResponse.json(
      { error: 'Er is op dit moment geen open loterij.' },
      { status: 404 },
    );
  }

  const [{ data: opNaam }, { data: opEmail }] = await Promise.all([
    sb
      .from('loten')
      .select('lotnummer, betaald, bedrag')
      .eq('ronde_id', ronde.id)
      .ilike('naam', naam), // hoofdletter-ongevoelig, exacte naam (geen wildcards)
    // Vanuit de club-app: ook loten met het e-mailadres van het lid als contact.
    /^[^\s@,()]+@[^\s@,()]+$/.test(email)
      ? sb.from('loten').select('lotnummer, betaald, bedrag').eq('ronde_id', ronde.id).ilike('contact', email)
      : Promise.resolve({ data: [] as { lotnummer: number; betaald: boolean; bedrag: number }[] }),
  ]);
  // Per lotnummer één keer (een lot kan zowel op naam als op e-mail gevonden zijn).
  const perNummer = new Map<number, { betaald: boolean; bedrag: number }>();
  for (const l of [...(opNaam ?? []), ...(opEmail ?? [])] as { lotnummer: number; betaald: boolean; bedrag: number }[]) {
    perNummer.set(l.lotnummer, { betaald: !!l.betaald, bedrag: Number(l.bedrag ?? 0) });
  }
  const nummers = [...perNummer.keys()].sort((a, b) => a - b);
  const som = (alleenOpen: boolean) =>
    Math.round([...perNummer.values()].filter((l) => !alleenOpen || !l.betaald).reduce((s, l) => s + l.bedrag, 0) * 100) / 100;

  return NextResponse.json({
    ronde: ronde.naam,
    ronde_id: ronde.id,
    nummers,
    totaal: som(false), // wat deze loten samen kosten
    openstaand: som(true), // nog niet afgevinkt door de penningmeester
  });
}
