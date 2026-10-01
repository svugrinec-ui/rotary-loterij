'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Meldt elke paginaweergave aan de analytics van de club-app (platform). Geen
 * cookies of opslag op het apparaat; alleen pad en of de app geïnstalleerd is.
 * Beheerpagina's tellen niet mee.
 */
export default function Meting({ platformUrl }: { platformUrl: string | null }) {
  const pad = usePathname() ?? '/';
  const vorige = useRef<string | null>(null);
  useEffect(() => {
    if (!platformUrl || vorige.current === pad) return;
    vorige.current = pad;
    if (/^\/beheer(\/|$)/.test(pad)) return;
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    // "/loterij" ervoor, zodat de pagina's in de analytics herkenbaar zijn.
    const data = JSON.stringify({ pad: `/loterij${pad === '/' ? '' : pad}`, app: 'loterij', standalone });
    const url = `${platformUrl.replace(/\/$/, '')}/meting`;
    try {
      if (!navigator.sendBeacon?.(url, new Blob([data], { type: 'text/plain' }))) {
        fetch(url, { method: 'POST', body: data, keepalive: true, mode: 'no-cors' }).catch(() => {});
      }
    } catch {
      // Meten mag de loterij nooit hinderen.
    }
  }, [pad, platformUrl]);
  return null;
}
