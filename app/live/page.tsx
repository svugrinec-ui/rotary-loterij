import { publicClient } from '@/lib/supabase';
import type { TrekkingLive } from '@/lib/types';
import TrekkingLiveView from './TrekkingLive';
import { getClubnaam } from '@/lib/instellingen';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return { title: `Live trekking — Loterij ${await getClubnaam()}` };
}

export default async function LivePage() {
  const sb = publicClient();

  const { data } = await sb
    .from('trekking_live')
    .select('*')
    .order('bijgewerkt_op', { ascending: false })
    .limit(1);

  const stand = ((data as TrekkingLive[] | null) ?? [])[0] ?? null;

  let rondeNaam: string | null = null;
  if (stand) {
    const { data: ronde } = await sb
      .from('rondes')
      .select('naam')
      .eq('id', stand.ronde_id)
      .single();
    rondeNaam = (ronde as { naam: string } | null)?.naam ?? null;
  }

  return <TrekkingLiveView start={stand} startRondeNaam={rondeNaam} />;
}
