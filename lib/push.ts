import webpush from 'web-push';
import { serviceClient } from './supabase';

/**
 * Pushmeldingen vanuit de loterij-app (web push; op de iPhone alleen als de app
 * op het beginscherm staat). Een apparaat meldt zich aan met een naam en
 * eventueel e-mail; daarop koppelen we het aan de aanmeldingen en de loten.
 */
export interface PushBericht {
  titel: string;
  tekst: string;
  url: string;
  tag?: string;
}

export interface Abonnement {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  naam: string | null;
  email: string | null;
}

/** Sleutel uit de omgeving, zonder spaties, regeleinden of '=' (komen soms mee bij het plakken). */
const schoon = (w: string | undefined) => (w ?? '').replace(/\s+/g, '').replace(/^["']|["']$/g, '').replace(/=+$/, '');

/** Publieke sleutel (mag in de pagina); beide namen worden geaccepteerd. */
export function publiekeSleutel(): string {
  return schoon(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY);
}

export function pushIngesteld(): boolean {
  return !!(publiekeSleutel() && schoon(process.env.VAPID_PRIVATE_KEY));
}

let klaar = false;
function zetSleutels() {
  if (klaar) return;
  webpush.setVapidDetails(
    (process.env.VAPID_SUBJECT ?? '').trim() || 'mailto:info@serviceclubsuite.nl',
    publiekeSleutel(),
    schoon(process.env.VAPID_PRIVATE_KEY),
  );
  klaar = true;
}

export async function actieveAbonnementen(): Promise<Abonnement[]> {
  const { data } = await serviceClient()
    .from('push_abonnementen')
    .select('id, endpoint, p256dh, auth, naam, email')
    .eq('actief', true);
  return (data as Abonnement[] | null) ?? [];
}

/** Namen en e-mailadressen vergelijken zonder hoofdletters, accenten of extra spaties. */
export const norm = (s: string | null | undefined) =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9@. ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Stuurt de melding naar deze apparaten; geeft terug hoeveel er bereikt zijn. */
export async function stuurPush(abos: Abonnement[], bericht: PushBericht): Promise<number> {
  if (!pushIngesteld() || abos.length === 0) return 0;
  zetSleutels();
  const payload = JSON.stringify(bericht);
  const verlopen: string[] = [];
  let bereikt = 0;
  await Promise.all(
    abos.map(async (a) => {
      try {
        await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, payload, {
          TTL: 3 * 3600,
          urgency: 'high',
        });
        bereikt += 1;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) verlopen.push(a.id); // apparaat heeft zich afgemeld
        else console.warn('Pushmelding niet afgeleverd:', status ?? (e as Error).message);
      }
    }),
  );
  // Niet verwijderen, alleen uitzetten.
  if (verlopen.length) await serviceClient().from('push_abonnementen').update({ actief: false }).in('id', verlopen);
  return bereikt;
}
