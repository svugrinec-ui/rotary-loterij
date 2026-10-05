import crypto from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, cookieOptions, createSessionToken } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * Inloggen in loterijbeheer vanuit de club-app, zonder wachtwoord. De club-app
 * geeft een kortlevende, ondertekende sleutel mee (alleen voor leden met de rol
 * loterijcommissie, penningmeester of webmaster), ondertekend met de gedeelde
 * LOTERIJ_KOPPELSLEUTEL. Klopt die, dan zetten we de gewone beheer-cookie.
 * Het wachtwoord blijft werken, bv. voor de laptop waarop de trekking draait.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const t = url.searchParams.get('t') ?? '';
  const naar = url.searchParams.get('naar') ?? '/beheer';
  const doel = new URL(naar.startsWith('/beheer') && !naar.startsWith('//') ? naar : '/beheer', url.origin);
  const sleutel = process.env.LOTERIJ_KOPPELSLEUTEL ?? '';
  const [exp, lid, sig] = t.split('.');
  const verloopt = Number(exp);
  if (sleutel.length >= 32 && lid && sig && Number.isFinite(verloopt) && verloopt > Date.now() && verloopt < Date.now() + 15 * 60_000) {
    const verwacht = crypto.createHmac('sha256', sleutel).update(`loterijbeheer|${lid}|${exp}`).digest('hex');
    if (sig.length === verwacht.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(verwacht))) {
      (await cookies()).set(ADMIN_COOKIE, createSessionToken(), cookieOptions);
    }
  }
  return NextResponse.redirect(doel);
}
