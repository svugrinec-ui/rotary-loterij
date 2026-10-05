import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { pushIngesteld } from '@/lib/push';
import { trekkingMelding } from '@/lib/loterijMeldingen';

export const runtime = 'nodejs';

/** Beheer: "De trekking begint zo" naar iedereen die meespeelt in deze ronde. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ fout: 'Niet ingelogd.' }, { status: 401 });
  if (!pushIngesteld()) return NextResponse.json({ fout: 'Meldingen zijn nog niet ingesteld.' }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { ronde_id?: string } | null;
  if (!body?.ronde_id) return NextResponse.json({ fout: 'Geen ronde.' }, { status: 400 });
  try {
    return NextResponse.json(await trekkingMelding(body.ronde_id));
  } catch (e) {
    const sleutelFout = /vapid/i.test((e as Error).message);
    console.error('Trekkingsmelding mislukt:', (e as Error).message);
    return NextResponse.json(
      { fout: sleutelFout ? 'De sleutels voor meldingen kloppen niet (VAPID in Vercel).' : 'Versturen is niet gelukt.' },
      { status: 500 },
    );
  }
}
