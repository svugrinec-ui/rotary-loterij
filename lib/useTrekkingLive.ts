'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { publicClient } from '@/lib/supabase';
import { DB_SCHEMA } from '@/lib/demo';
import { leesMijnLoten, MIJN_LOTEN_EVENT, type MijnLoten } from '@/lib/mijnLoten';
import { trekkingActief } from '@/lib/trekkingActief';
import type { TrekkingLive } from '@/lib/types';

const POLL_MS = 5000;
const ROL_MS = 70;

function willekeurigNummer(pool: number[]): number {
  if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
  return Math.floor(Math.random() * 9900) + 100;
}

/**
 * Volgt de trekking die de commissie doet: Supabase Realtime als hoofdweg, met
 * een poll als vangnet voor telefoons waar websockets niet doorkomen.
 * `rol` is het cijfer dat tijdens het trekken voorbijrolt.
 */
export function useTrekkingLive(
  start: TrekkingLive | null = null,
  startRondeNaam: string | null = null,
  /** Uit op plekken waar niet meegekeken hoeft te worden (bijv. /beheer). */
  aan = true,
) {
  const [stand, setStand] = useState<TrekkingLive | null>(start);
  const [rondeNaam, setRondeNaam] = useState<string | null>(startRondeNaam);
  const [rol, setRol] = useState<number | null>(null);
  const rondeIdRef = useRef<string | null>(start?.ronde_id ?? null);

  const laad = useCallback(async () => {
    try {
      const res = await fetch('/api/trekking-live', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as {
        stand: TrekkingLive | null;
        rondeNaam: string | null;
      };
      setStand(data.stand);
      setRondeNaam(data.rondeNaam);
      rondeIdRef.current = data.stand?.ronde_id ?? null;
    } catch {
      /* volgende tik weer */
    }
  }, []);

  useEffect(() => {
    if (!aan) return;
    // Beginstand ophalen (de pagina kan die ook meegeven; dan is dit een check).
    void laad();

    const sb = publicClient();
    const kanaal = sb
      .channel('trekking-live')
      .on(
        'postgres_changes',
        { event: '*', schema: DB_SCHEMA, table: 'trekking_live' },
        (bericht) => {
          const nieuw = bericht.new as TrekkingLive | undefined;
          if (!nieuw?.ronde_id) return void laad();
          // Andere ronde dan we kennen? Dan hebben we ook de rondenaam nodig.
          if (nieuw.ronde_id !== rondeIdRef.current) return void laad();
          setStand(nieuw);
        },
      )
      .subscribe();

    const tik = setInterval(() => {
      if (!document.hidden) void laad();
    }, POLL_MS);
    const bijTerugkomen = () => {
      if (!document.hidden) void laad();
    };
    document.addEventListener('visibilitychange', bijTerugkomen);

    return () => {
      void sb.removeChannel(kanaal);
      clearInterval(tik);
      document.removeEventListener('visibilitychange', bijTerugkomen);
    };
  }, [laad, aan]);

  // Rollende cijfers zolang de commissie aan het trekken is.
  const poolRef = useRef<number[]>([]);
  poolRef.current = stand?.pool_nummers ?? [];
  const fase = stand?.fase;
  const prijsIndex = stand?.prijs_index;
  useEffect(() => {
    if (fase !== 'rollen') {
      setRol(null);
      return;
    }
    setRol(willekeurigNummer(poolRef.current));
    const tik = setInterval(() => setRol(willekeurigNummer(poolRef.current)), ROL_MS);
    return () => clearInterval(tik);
  }, [fase, prijsIndex]);

  return {
    stand,
    rondeNaam,
    rol,
    /** Er is een trekking aan de gang (vanaf "Start trekking" tot de uitslag). */
    actief: trekkingActief(stand),
  };
}

/**
 * De eigen loten uit de browseropslag, voor de ronde die nu getrokken wordt.
 * Leest opnieuw zodra er loten bijkomen — anders staat de trekking straks met
 * de loten van wie er vóór jou op dit toestel is ingeschreven.
 */
export function useMijnLoten(rondeId?: string) {
  const [mijn, setMijn] = useState<MijnLoten | null>(null);

  useEffect(() => {
    const lees = () => setMijn(leesMijnLoten(rondeId));
    lees();
    window.addEventListener(MIJN_LOTEN_EVENT, lees);
    window.addEventListener('storage', lees); // ander tabblad
    return () => {
      window.removeEventListener(MIJN_LOTEN_EVENT, lees);
      window.removeEventListener('storage', lees);
    };
  }, [rondeId]);

  return [mijn, setMijn] as const;
}
