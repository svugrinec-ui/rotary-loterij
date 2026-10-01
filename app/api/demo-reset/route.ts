import { timingSafeEqual } from 'crypto';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { isDemo } from '@/lib/demo';
import { zetDemoTerug } from '@/lib/demoReset';

export const maxDuration = 60;

// Elke nacht (Vercel-cron) de testversie terugzetten. Bestaat alleen in de
// demo; de echte loterij geeft hier 404.
export async function GET(req: Request) {
  if (!isDemo) return NextResponse.json({ fout: 'Niet gevonden' }, { status: 404 });
  const sleutel = process.env.CRON_SECRET ?? '';
  const gegeven = Buffer.from((req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, ''));
  const b = Buffer.from(sleutel);
  if (sleutel.length < 16 || b.length !== gegeven.length || !timingSafeEqual(b, gegeven)) {
    return NextResponse.json({ fout: 'Niet toegestaan' }, { status: 401 });
  }
  try {
    const uit = await zetDemoTerug();
    revalidatePath('/', 'layout');
    return NextResponse.json({ ok: true, ...uit });
  } catch (e) {
    return NextResponse.json({ fout: (e as Error).message }, { status: 500 });
  }
}
