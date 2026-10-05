'use client';

import { useEffect } from 'react';

/** Wie de app opent, heeft de meldingen gezien: rode balletje weg en meldingen opruimen. */
export default function MeldingenGelezen() {
  useEffect(() => {
    const gelezen = () => {
      if (document.visibilityState !== 'visible' || !('serviceWorker' in navigator)) return;
      (async () => {
        const reg = await navigator.serviceWorker.getRegistration('/');
        for (const m of (await reg?.getNotifications()) ?? []) m.close();
        await (navigator as { clearAppBadge?: () => Promise<void> }).clearAppBadge?.();
      })().catch(() => {});
    };
    gelezen();
    document.addEventListener('visibilitychange', gelezen);
    return () => document.removeEventListener('visibilitychange', gelezen);
  }, []);
  return null;
}
