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
  return NextResponse.json(await trekkingMelding(body.ronde_id));
}
