'use client';

import { useEffect, useState } from 'react';
import { leesMijnLoten } from '@/lib/mijnLoten';

type Stand = 'laden' | 'niet-mogelijk' | 'eerst-beginscherm' | 'geweigerd' | 'uit' | 'aan';
const NAAM_KEY = 'rotary-loterij:melding-naam';

function sleutelNaarBytes(base64: string): Uint8Array<ArrayBuffer> {
  const opgevuld = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const ruw = atob(opgevuld);
  const bytes = new Uint8Array(new ArrayBuffer(ruw.length));
  for (let i = 0; i < ruw.length; i++) bytes[i] = ruw.charCodeAt(i);
  return bytes;
}

/** Hoort dit abonnement bij de huidige sleutel? (Na een nieuwe sleutel moet het apparaat opnieuw aanmelden.) */
function zelfdeSleutel(abo: PushSubscription, sleutel: string): boolean {
  const oud = abo.options?.applicationServerKey;
  if (!oud) return true;
  const a = new Uint8Array(oud);
  const b = sleutelNaarBytes(sleutel);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Meldingen aanzetten in de loterij-app: een seintje als de trekking begint en,
 * voor wie zich voor de clubavond heeft aangemeld, om 18:00 als er nog geen
 * loten zijn. Met je naam (zoals bij de club bekend) koppelen we het aan de
 * aanmeldingen en de loten. Op de iPhone alleen in de app op het beginscherm.
 */
export default function LoterijMeldingen({ publiekeSleutel }: { publiekeSleutel: string }) {
  const [stand, setStand] = useState<Stand>('laden');
  const [naam, setNaam] = useState('');
  const [email, setEmail] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      let bewaard = '';
      try {
        bewaard = localStorage.getItem(NAAM_KEY) ?? '';
      } catch {}
      setNaam(bewaard || leesMijnLoten()?.naam || '');
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const standalone =
        window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setStand(ios && !standalone ? 'eerst-beginscherm' : 'niet-mogelijk');
        return;
      }
      if (Notification.permission === 'denied') return setStand('geweigerd');
      const reg = await navigator.serviceWorker.getRegistration('/');
      const abo = await reg?.pushManager.getSubscription();
      setStand(abo && zelfdeSleutel(abo, publiekeSleutel) ? 'aan' : 'uit');
    })().catch(() => setStand('niet-mogelijk'));
  }, [publiekeSleutel]);

  async function zetAan(e: React.FormEvent) {
    e.preventDefault();
    setFout(null);
    if (!naam.trim()) return setFout('Vul je naam in.');
    setBezig(true);
    try {
      const toestemming = await Notification.requestPermission();
      if (toestemming !== 'granted') {
        setStand(toestemming === 'denied' ? 'geweigerd' : 'uit');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const bestaand = await reg.pushManager.getSubscription();
      if (bestaand && !zelfdeSleutel(bestaand, publiekeSleutel)) {
        // Oude aanmelding (andere sleutel) uitzetten en opnieuw aanmelden.
        await fetch('/api/push', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: bestaand.endpoint }),
        }).catch(() => {});
        await bestaand.unsubscribe();
      }
      const abo =
        (bestaand && zelfdeSleutel(bestaand, publiekeSleutel) ? bestaand : null) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: sleutelNaarBytes(publiekeSleutel) }));
      const res = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...abo.toJSON(), naam: naam.trim(), email: email.trim() }),
      });
      const uit = (await res.json().catch(() => ({}))) as { fout?: string };
      if (!res.ok) throw new Error(uit.fout ?? 'Aanzetten is niet gelukt.');
      try {
        localStorage.setItem(NAAM_KEY, naam.trim());
      } catch {}
      setStand('aan');
    } catch (e) {
      setFout(e instanceof Error ? e.message : 'Aanzetten is niet gelukt.');
    } finally {
      setBezig(false);
    }
  }

  async function zetUit() {
    setBezig(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const abo = await reg?.pushManager.getSubscription();
      if (abo) {
        await fetch('/api/push', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: abo.endpoint }),
        });
        await abo.unsubscribe();
      }
      setStand('uit');
    } finally {
      setBezig(false);
    }
  }

  if (stand === 'laden' || stand === 'niet-mogelijk') return null;

  return (
    <section className="meldingen-kaart">
      <h2>🔔 Meldingen</h2>
      {stand === 'aan' ? (
        <div className="meldingen-aan">
          <p>
            Meldingen staan aan{naam ? ` voor ${naam}` : ''}. Je krijgt een seintje als de trekking begint, en om 18:00 als
            je bent aangemeld voor de clubavond maar nog geen loten hebt.
          </p>
          <button className="btn btn-ghost" type="button" onClick={zetUit} disabled={bezig}>
            Uitzetten
          </button>
        </div>
      ) : (
        <>
          <p>
            Krijg een seintje als de trekking begint, en om 18:00 als je bent aangemeld voor de clubavond maar nog geen
            loten hebt.
          </p>
          {stand === 'eerst-beginscherm' && (
            <p className="meldingen-tip">
              Op de iPhone werken meldingen alleen in de app op je beginscherm. Tik in Safari op <strong>Deel</strong> →{' '}
              <strong>Zet op beginscherm</strong> en open de loterij daar.
            </p>
          )}
          {stand === 'geweigerd' && (
            <p className="meldingen-tip">
              Meldingen zijn geblokkeerd. Zet ze aan in de instellingen van je telefoon (Meldingen → Loterij).
            </p>
          )}
          {stand === 'uit' && (
            <form onSubmit={zetAan}>
              <label htmlFor="melding-naam">Je naam (zoals bij de club bekend)</label>
              <input id="melding-naam" type="text" value={naam} onChange={(e) => setNaam(e.target.value)} autoComplete="name" />
              <label htmlFor="melding-email">
                E-mailadres <span className="muted">(optioneel, voor een betere koppeling)</span>
              </label>
              <input
                id="melding-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              <button className="btn" type="submit" disabled={bezig} style={{ marginTop: 14 }}>
                {bezig ? 'Even geduld…' : 'Meldingen aanzetten'}
              </button>
              {fout && <p className="meldingen-fout">{fout}</p>}
            </form>
          )}
        </>
      )}
    </section>
  );
}

/** Wie de app opent, heeft de meldingen gezien: rode balletje weg en meldingen opruimen. */
export function MeldingenGelezen() {
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
