'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { publicClient } from '@/lib/supabase';
import { DB_SCHEMA } from '@/lib/demo';
import { euro } from '@/lib/format';
import DoelMeter from '@/components/DoelMeter';
import type { Voortgang } from '@/lib/doel';

export interface Stand {
  voortgang: Voortgang;
  doelNaam: string | null;
  vorige: { maandNaam: string; opgehaald: number; doel: number } | null;
}

interface Props {
  /** Stand zoals de server die rendert — meteen goed, ook zonder JS. */
  start: Stand;
  /** Maand van de ronde waar de bezoeker naar kijkt (voor het juiste doel). */
  maand?: string;
  titel?: string;
  doelLabel?: string;
  motiverend?: boolean;
}

const POLL_MS = 20000;

/**
 * De maandmeter die live meebeweegt. Elke keer dat iemand loten koopt werkt de
 * server `rondes.opbrengst` bij; daar luisteren we via Supabase Realtime op.
 * Als websockets niet door het netwerk komen, blijft de poll als vangnet over.
 */
export default function LiveDoelMeter({
  start,
  maand,
  titel,
  doelLabel,
  motiverend,
}: Props) {
  const [stand, setStand] = useState<Stand>(start);
  const [erbij, setErbij] = useState(0);
  const vorigBedrag = useRef(start.voortgang.opgehaald);

  const laad = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/voortgang${maand ? `?maand=${encodeURIComponent(maand)}` : ''}`,
        { cache: 'no-store' },
      );
      if (!res.ok) return;
      setStand(await res.json());
    } catch {
      /* stil: bij een hik proberen we het bij de volgende tik weer */
    }
  }, [maand]);

  useEffect(() => {
    const sb = publicClient();
    const kanaal = sb
      .channel('meter-rondes')
      .on(
        'postgres_changes',
        { event: '*', schema: DB_SCHEMA, table: 'rondes' },
        () => void laad(),
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
  }, [laad]);

  // Komt er geld bij? Even laten oplichten met het bedrag erbij.
  useEffect(() => {
    const nu = stand.voortgang.opgehaald;
    const verschil = Math.round((nu - vorigBedrag.current) * 100) / 100;
    vorigBedrag.current = nu;
    if (verschil <= 0) return;
    setErbij(verschil);
    const t = setTimeout(() => setErbij(0), 4500);
    return () => clearTimeout(t);
  }, [stand]);

  return (
    <div className={`live-meter${erbij > 0 ? ' groeit' : ''}`}>
      <DoelMeter
        voortgang={stand.voortgang}
        titel={titel}
        doelNaam={stand.doelNaam ?? undefined}
        doelLabel={doelLabel}
        motiverend={motiverend}
        vorige={stand.vorige}
      />
      {erbij > 0 && (
        <div className="live-bump" role="status">
          + {euro(erbij)} zojuist!
        </div>
      )}
    </div>
  );
}
