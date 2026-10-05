import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { pushIngesteld } from '@/lib/push';
import { serviceClient } from '@/lib/supabase';
import { haalAvonden } from '@/lib/aanmeldingen';
import { herinnerZonderLot } from '@/lib/loterijMeldingen';

export const runtime = 'nodejs';

/** Beheer: nu een herinnering sturen aan aangemelde leden van deze avond die nog geen lot hebben. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ fout: 'Niet ingelogd.' }, { status: 401 });
  if (!pushIngesteld()) return NextResponse.json({ fout: 'Meldingen zijn nog niet ingesteld.' }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { ronde_id?: string; avond_id?: string } | null;
  if (!body?.ronde_id || !body.avond_id) return NextResponse.json({ fout: 'Geen ronde of avond.' }, { status: 400 });
  const { data: ronde } = await serviceClient().from('rondes').select('id, maand').eq('id', body.ronde_id).maybeSingle();
  if (!ronde) return NextResponse.json({ fout: 'Ronde niet gevonden.' }, { status: 404 });
  const { avonden } = await haalAvonden((ronde.maand as string).slice(0, 7));
  const avond = avonden.find((a) => a.id === body.avond_id);
  if (!avond) return NextResponse.json({ fout: 'Clubavond niet gevonden.' }, { status: 404 });
  try {
    return NextResponse.json(await herinnerZonderLot(ronde.id as string, avond));
  } catch (e) {
    console.error('Herinnering mislukt:', (e as Error).message);
    return NextResponse.json({ fout: 'Versturen is niet gelukt.' }, { status: 500 });
  }
}
