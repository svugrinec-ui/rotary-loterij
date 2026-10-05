import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { lotenHerinnering } from '@/lib/loterijMeldingen';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Herinnering "nog geen loten" op de dag van de clubavond, vanaf 18:00.
// Aangeroepen door de Vercel-cron (16:00 en 17:00 UTC: zomer- en wintertijd);
// verstuurt per ronde maar één keer.
function toegestaan(req: Request): boolean {
  const gegeven = Buffer.from((req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, ''));
  const s = process.env.CRON_SECRET;
  if (!s || s.length < 16) return false;
  const b = Buffer.from(s);
  return b.length === gegeven.length && timingSafeEqual(b, gegeven);
}

export async function GET(req: Request) {
  if (!toegestaan(req)) return NextResponse.json({ fout: 'Niet toegestaan' }, { status: 401 });
  return NextResponse.json(await lotenHerinnering());
}
