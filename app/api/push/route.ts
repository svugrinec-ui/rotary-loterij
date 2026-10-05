import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';

export const runtime = 'nodejs';

/**
 * Een apparaat aan- of afmelden voor meldingen. Met een naam (en eventueel
 * e-mail), zodat we de melding kunnen koppelen aan aanmeldingen en loten.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    naam?: string;
    email?: string;
  } | null;
  const naam = (body?.naam ?? '').trim().slice(0, 120);
  const email = (body?.email ?? '').trim().slice(0, 200);
  if (!body?.endpoint?.startsWith('https://') || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ fout: 'Ongeldig abonnement.' }, { status: 400 });
  }
  if (!naam) return NextResponse.json({ fout: 'Vul je naam in.' }, { status: 400 });
  const { error } = await serviceClient()
    .from('push_abonnementen')
    .upsert(
      {
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        naam,
        email: email || null,
        actief: true,
        bijgewerkt_op: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    );
  if (error) return NextResponse.json({ fout: 'Opslaan is niet gelukt.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Meldingen uit op dit apparaat (de rij blijft bestaan, alleen niet meer actief). */
export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) return NextResponse.json({ ok: true });
  await serviceClient().from('push_abonnementen').update({ actief: false }).eq('endpoint', body.endpoint);
  return NextResponse.json({ ok: true });
}
