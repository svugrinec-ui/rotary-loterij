'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { publicClient } from '@/lib/supabase';
import { DB_SCHEMA } from '@/lib/demo';

/**
 * Houdt een beheerscherm vanzelf actueel. Koopt iemand loten (of wordt een
 * betaling afgevinkt), dan wordt de ronde bijgewerkt en ververst dit scherm
 * binnen een seconde. Daarnaast elke 30 seconden, zodat ook aan- en afmeldingen
 * uit de club-app meekomen. Alleen zolang het scherm in beeld is.
 */
export default function BeheerLive({ rondeIds }: { rondeIds: string[] }) {
  const router = useRouter();
  const wacht = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleutel = rondeIds.join(',');

  useEffect(() => {
    const ververs = () => {
      if (document.hidden) return;
      if (wacht.current) clearTimeout(wacht.current);
      // Meerdere wijzigingen vlak na elkaar: één keer verversen.
      wacht.current = setTimeout(() => router.refresh(), 400);
    };
    const sb = publicClient();
    let kanaal = sb.channel(`beheer-live-${sleutel || 'leeg'}`);
    for (const id of sleutel ? sleutel.split(',') : []) {
      kanaal = kanaal.on('postgres_changes', { event: 'UPDATE', schema: DB_SCHEMA, table: 'rondes', filter: `id=eq.${id}` }, ververs);
    }
    kanaal.subscribe();
    const tik = setInterval(ververs, 30_000);
    const terug = () => !document.hidden && ververs();
    document.addEventListener('visibilitychange', terug);
    return () => {
      void sb.removeChannel(kanaal);
      clearInterval(tik);
      document.removeEventListener('visibilitychange', terug);
      if (wacht.current) clearTimeout(wacht.current);
    };
  }, [router, sleutel]);

  return null;
}
