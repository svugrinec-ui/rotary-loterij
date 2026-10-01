import { timingSafeEqual } from 'crypto';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { syncRondes } from '@/lib/syncRondes';

// Synchronisatie rondes ↔ clubavonden. Aangeroepen door de club-app (bij elke
// wijziging aan een activiteit) en dagelijks door de Vercel-cron (vangnet).
// Alleen met de geheime sleutel (LOTERIJ_KOPPELSLEUTEL of CRON_SECRET).

function toegestaan(req: Request): boolean {
  const gegeven = Buffer.from((req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, ''));
  return [process.env.LOTERIJ_KOPPELSLEUTEL, process.env.CRON_SECRET]
    .filter((s): s is string => !!s && s.length >= 32)
    .some((s) => {
      const b = Buffer.from(s);
      return b.length === gegeven.length && timingSafeEqual(b, gegeven);
    });
}

async function afhandelen(req: Request) {
  if (!toegestaan(req)) return NextResponse.json({ fout: 'Niet toegestaan' }, { status: 401 });
  const uitkomst = await syncRondes();
  revalidatePath('/beheer');
  return NextResponse.json(uitkomst, { status: uitkomst.fout ? 502 : 200 });
}

export const GET = afhandelen; // Vercel-cron
export const POST = afhandelen; // club-app
