import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';
import { trekkingActief } from '@/lib/trekkingActief';
import { norm } from '@/lib/push';

export const runtime = 'nodejs';

// Voor de club-app (gouden loterijstrook in de Agenda): is er bij deze clubavond
// een ronde, hoeveel loten heeft dit lid, en loopt de trekking nu?
// Alleen met de geheime LOTERIJ_KOPPELSLEUTEL. Geeft geen namen van anderen terug.
function toegestaan(req: Request): boolean {
  const gegeven = Buffer.from((req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, ''));
  const s = process.env.LOTERIJ_KOPPELSLEUTEL;
  if (!s || s.length < 32) return false;
  const b = Buffer.from(s);
  return b.length === gegeven.length && timingSafeEqual(b, gegeven);
}

export async function POST(req: Request) {
  if (!toegestaan(req)) return NextResponse.json({ fout: 'Niet toegestaan' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { bijeenkomst_id?: string; naam?: string; email?: string } | null;
  if (!body?.bijeenkomst_id) return NextResponse.json({ fout: 'Geen clubavond' }, { status: 400 });
  const sb = serviceClient();
  const { data: ronde } = await sb
    .from('rondes')
    .select('id, status')
    .eq('bijeenkomst_id', body.bijeenkomst_id)
    .maybeSingle();
  if (!ronde) return NextResponse.json({ ronde: null, loten: 0, live: false });
  const [{ data: loten }, { data: stand }] = await Promise.all([
    sb.from('loten').select('naam, contact').eq('ronde_id', ronde.id),
    sb.from('trekking_live').select('fase, bijgewerkt_op').eq('ronde_id', ronde.id).maybeSingle(),
  ]);
  const naam = norm(body.naam);
  const email = norm(body.email);
  const mijn = ((loten ?? []) as { naam: string; contact: string | null }[]).filter(
    (l) => (naam && norm(l.naam) === naam) || (email && norm(l.contact).includes(email)),
  ).length;
  return NextResponse.json({
    ronde: { status: ronde.status },
    loten: mijn,
    live: trekkingActief(stand as { fase: string; bijgewerkt_op: string } | null),
  });
}
